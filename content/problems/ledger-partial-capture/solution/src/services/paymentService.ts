import { InvalidTransitionError, ValidationError } from "../domain/errors";
import { credit, debit, Posting } from "../domain/journal";
import { applyBps, money } from "../domain/money";
import type { Payment } from "../domain/payment";
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
 *   capture:   Dr holds (authorized)   Cr merchant (captured - fee), Cr fees (fee),
 *                                      Cr customer wallet (authorized - captured, released)
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

  /**
   * Captures all of the authorization, or `opts.amount` of it (partial capture).
   * A payment is captured at most once; any uncaptured remainder is released
   * back to the customer in the same entry.
   */
  capture(paymentId: string, opts: { amount?: number } = {}): Payment {
    const p = this.get(paymentId);
    if (p.status !== "authorized") {
      throw new InvalidTransitionError(`cannot capture payment in status ${p.status}`);
    }
    if (this.ctx.clock.now() > p.expiresAt) {
      // Lazily expire: release the hold, persist, then reject the capture.
      this.expire(p);
      throw new InvalidTransitionError(`cannot capture payment in status expired`);
    }

    const requested = opts.amount ?? p.amount;
    if (!Number.isSafeInteger(requested) || requested <= 0 || requested > p.amount) {
      throw new ValidationError(`capture amount must be a positive integer no greater than the authorized ${p.amount}`, {
        field: "amount",
      });
    }
    const amount = money(requested, p.currency);
    const released = p.amount - requested;
    const fee = applyBps(amount, this.ctx.config.feeBps);
    const holds = this.accounts.ensureSystemAccount(p.tenantId, "holds", p.currency);
    const postings: Posting[] = [
      debit(holds.id, money(p.amount, p.currency)),
      credit(p.merchantAccountId, money(amount.amount - fee.amount, p.currency)),
    ];
    if (released > 0) postings.push(credit(p.customerAccountId, money(released, p.currency)));
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
      status: "captured",
      capturedAmount: amount.amount,
      feeAmount: fee.amount,
      capturedAt: this.ctx.clock.now(),
      entryIds: [...p.entryIds, entry.id],
    });
    this.ctx.bus.publish(
      "payment.captured",
      { paymentId: p.id, amount: amount.amount, fee: fee.amount, released },
      p.tenantId,
    );
    return updated;
  }

  void(paymentId: string): Payment {
    const p = this.get(paymentId);
    if (p.status === "voided") throw new InvalidTransitionError(`cannot void payment in status voided`);
    if (p.status != "authorized") {
      throw new InvalidTransitionError(`cannot void payment in status ${p.status}`);
    }
    const entryId = this.releaseHold(p, `Void ${p.id}`, "void");
    const updated = this.ctx.repos.payments.update(p.id, {
      status: "voided",
      voidedAt: this.ctx.clock.now(),
      entryIds: [...p.entryIds, entryId],
    });
    this.ctx.bus.publish("payment.voided", { paymentId: p.id }, p.tenantId);
    return updated;
  }

  refund(paymentId: string, amountMinor: number): Payment {
    const p = this.get(paymentId);
    if (!(p.status === "captured" || p.status === "partially_refunded")) {
      throw new InvalidTransitionError(`cannot refund payment in status ${p.status}`);
    }
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
      status: refundedAmount === p.capturedAmount ? "refunded" : "partially_refunded",
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
      if (now > p.expiresAt) {
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
    if (p.status !== "authorized") throw new InvalidTransitionError(`cannot expire payment in status ${p.status}`);
    const entryId = this.releaseHold(p, `Expire ${p.id}`, "expire");
    const updated = this.ctx.repos.payments.update(p.id, {
      status: "expired",
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
