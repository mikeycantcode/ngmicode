import { ValidationError } from "../domain/errors";
import { credit, debit, Posting } from "../domain/journal";
import { applyBps, money } from "../domain/money";
import type { Payment } from "../domain/payment";
import { canTransition, transition } from "../domain/paymentStateMachine";
import type { AccountService } from "./accountService";
import type { ServiceContext } from "./index";
import type { JournalService } from "./journalService";

export interface AuthorizeInput {
  tenantId: string;
  customerAccountId: string;
  merchantAccountId: string;
  amount: number;
  currency: string;
  reference?: string;
}

/**
 * Payment lifecycle on top of the journal. Money flow (all same currency):
 *
 *   authorize: Dr customer wallet      Cr holds            (amount)
 *   capture:   Dr holds (amount)       Cr merchant (amount - fee), Cr fees (fee)
 *   void:      Dr holds                Cr customer wallet  (amount)
 *   expire:    same postings as void
 *   refund:    Dr merchant             Cr customer wallet  (refund amount; fee is NOT returned)
 *
 * Customer wallets and merchant payables are liability accounts. Merchant
 * payables are opened with allowNegative so refunds can exceed what we still
 * owe them (netted on the next settlement run).
 */
export class PaymentService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly accounts: AccountService,
    private readonly journal: JournalService,
  ) {}

  authorize(input: AuthorizeInput): Payment {
    const { tenantId, customerAccountId, merchantAccountId, currency } = input;
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new ValidationError("amount must be a positive integer", { field: "amount" });
    }
    const amount = money(input.amount, currency);
    const customer = this.accounts.get(customerAccountId);
    const merchant = this.accounts.get(merchantAccountId);
    for (const acct of [customer, merchant]) {
      if (acct.tenantId !== tenantId) throw new ValidationError(`account ${acct.id} does not belong to tenant ${tenantId}`);
      if (acct.type !== "liability") throw new ValidationError(`account ${acct.id} must be a liability (wallet/payable) account`);
      if (acct.currency !== currency) {
        throw new ValidationError(`account ${acct.id} is in ${acct.currency}, payment is in ${currency}`);
      }
    }
    if (customer.id === merchant.id) throw new ValidationError("customer and merchant must differ");

    const id = this.ctx.ids.next("pay");
    const holds = this.accounts.ensureSystemAccount(tenantId, "holds", currency);
    const entry = this.journal.post({
      tenantId,
      description: `Authorization ${id}`,
      postings: [debit(customer.id, amount), credit(holds.id, amount)],
      metadata: { paymentId: id, kind: "authorization" },
    });

    const now = this.ctx.clock.now();
    const payment: Payment = {
      id,
      tenantId,
      customerAccountId,
      merchantAccountId,
      amount: amount.amount,
      currency,
      capturedAmount: 0,
      refundedAmount: 0,
      feeAmount: 0,
      status: "authorized",
      authorizedAt: now,
      expiresAt: now + this.ctx.config.authorizationTtlMs,
      reference: input.reference,
      entryIds: [entry.id],
      refunds: [],
    };
    const saved = this.ctx.repos.payments.insert(payment);
    this.ctx.bus.publish("payment.authorized", { paymentId: id, amount: amount.amount, currency }, tenantId);
    return saved;
  }

  capture(paymentId: string): Payment {
    let p = this.get(paymentId);
    if (canTransition(p.status, "expire") && this.ctx.clock.now() > p.expiresAt) {
      // Lazily expire: release the hold, persist, then reject the capture.
      p = this.expire(p);
    }
    const status = transition(p.status, "capture");

    const amount = money(p.amount, p.currency);
    const fee = applyBps(amount, this.ctx.config.feeBps);
    const holds = this.accounts.ensureSystemAccount(p.tenantId, "holds", p.currency);
    const postings: Posting[] = [
      debit(holds.id, amount),
      credit(p.merchantAccountId, money(amount.amount - fee.amount, p.currency)),
    ];
    if (fee.amount > 0) {
      const fees = this.accounts.ensureSystemAccount(p.tenantId, "fees", p.currency);
      postings.push(credit(fees.id, fee));
    }
    const entry = this.journal.post({
      tenantId: p.tenantId,
      description: `Capture ${p.id}`,
      postings,
      metadata: { paymentId: p.id, kind: "capture" },
    });

    const updated = this.ctx.repos.payments.update(p.id, {
      status,
      capturedAmount: amount.amount,
      feeAmount: fee.amount,
      capturedAt: this.ctx.clock.now(),
      entryIds: [...p.entryIds, entry.id],
    });
    this.ctx.bus.publish("payment.captured", { paymentId: p.id, amount: amount.amount, fee: fee.amount }, p.tenantId);
    return updated;
  }

  void(paymentId: string): Payment {
    const p = this.get(paymentId);
    const status = transition(p.status, "void");
    const entryId = this.releaseHold(p, `Void ${p.id}`, "void");
    const updated = this.ctx.repos.payments.update(p.id, {
      status,
      voidedAt: this.ctx.clock.now(),
      entryIds: [...p.entryIds, entryId],
    });
    this.ctx.bus.publish("payment.voided", { paymentId: p.id }, p.tenantId);
    return updated;
  }

  refund(paymentId: string, amountMinor: number): Payment {
    const p = this.get(paymentId);
    transition(p.status, "refund"); // status guard before input validation, as before
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new ValidationError("refund amount must be a positive integer", { field: "amount" });
    }
    const remaining = p.capturedAmount - p.refundedAmount;
    if (amountMinor > remaining) {
      throw new ValidationError(`refund exceeds refundable amount (${remaining} remaining)`, { field: "amount", remaining });
    }
    const amount = money(amountMinor, p.currency);
    const entry = this.journal.post({
      tenantId: p.tenantId,
      description: `Refund ${p.id}`,
      postings: [debit(p.merchantAccountId, amount), credit(p.customerAccountId, amount)],
      metadata: { paymentId: p.id, kind: "refund" },
    });
    const refundedAmount = p.refundedAmount + amountMinor;
    const updated = this.ctx.repos.payments.update(p.id, {
      refundedAmount,
      status: transition(p.status, refundedAmount === p.capturedAmount ? "refund_full" : "refund"),
      entryIds: [...p.entryIds, entry.id],
      refunds: [...p.refunds, { id: this.ctx.ids.next("rf"), amount: amountMinor, at: this.ctx.clock.now(), entryId: entry.id }],
    });
    this.ctx.bus.publish(
      "payment.refunded",
      { paymentId: p.id, amount: amountMinor, refundedTotal: refundedAmount },
      p.tenantId,
    );
    return updated;
  }

  /**
   * Sweeper entry point (cron, every 15 min): expires every authorized payment
   * whose hold is past its TTL. Returns the number expired.
   */
  expireStale(): number {
    const now = this.ctx.clock.now();
    let n = 0;
    for (const p of this.ctx.repos.payments.listByStatus("authorized")) {
      if (canTransition(p.status, "expire") && now > p.expiresAt) {
        this.expire(p);
        n++;
      }
    }
    return n;
  }

  get(paymentId: string): Payment {
    return this.ctx.repos.payments.require(paymentId);
  }

  list(tenantId: string): Payment[] {
    return this.ctx.repos.payments.listByTenant(tenantId);
  }

  private expire(p: Payment): Payment {
    const status = transition(p.status, "expire");
    const entryId = this.releaseHold(p, `Expire ${p.id}`, "expire");
    const updated = this.ctx.repos.payments.update(p.id, {
      status,
      expiredAt: this.ctx.clock.now(),
      entryIds: [...p.entryIds, entryId],
    });
    this.ctx.bus.publish("payment.expired", { paymentId: p.id }, p.tenantId);
    return updated;
  }

  private releaseHold(p: Payment, description: string, kind: string): string {
    const amount = money(p.amount, p.currency);
    const holds = this.accounts.ensureSystemAccount(p.tenantId, "holds", p.currency);
    const entry = this.journal.post({
      tenantId: p.tenantId,
      description,
      postings: [debit(holds.id, amount), credit(p.customerAccountId, amount)],
      metadata: { paymentId: p.id, kind },
    });
    return entry.id;
  }
}
