import { InvalidTransitionError, ValidationError } from "../domain/errors";
import { credit, debit, Posting } from "../domain/journal";
import { applyBps, money } from "../domain/money";
import { divRound } from "../lib/numeric";
import type { Payment } from "../domain/payment";
import type { AccountService } from "./accountService";
import type { FxService } from "./fxService";
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
 * Cross-currency (merchant currency S != payment currency P): capture converts
 * at the capture-time rate through per-currency fx_clearing accounts:
 *   capture:   Dr holds(P)  Cr fx_clearing(P)   |  Dr fx_clearing(S)  Cr merchant(S) (net), Cr fees(S)
 *   refund:    Dr merchant(S) Cr fx_clearing(S) |  Dr fx_clearing(P)  Cr customer(P)
 * Refunds use the rate locked at capture (settlementAmount / capturedAmount);
 * the refund that completes the payment takes the exact settlement remainder.
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
    private readonly fx: FxService,
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
    }
    // The payment is denominated in the customer's currency; the merchant may settle in another.
    if (customer.currency !== currency) {
      throw new ValidationError(`account ${customer.id} is in ${customer.currency}, payment is in ${currency}`);
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
      settlementCurrency: merchant.currency,
      settlementRefunded: 0,
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
    const p = this.get(paymentId);
    if (p.status !== "authorized") {
      throw new InvalidTransitionError(`cannot capture payment in status ${p.status}`);
    }
    if (this.ctx.clock.now() > p.expiresAt) {
      // Lazily expire: release the hold, persist, then reject the capture.
      this.expire(p);
      throw new InvalidTransitionError(`cannot capture payment in status expired`);
    }

    const amount = money(p.amount, p.currency);
    const S = p.settlementCurrency;
    const settlement = S === p.currency ? amount : this.fx.convert(amount, S); // throws NoRateError before any posting
    const fee = applyBps(settlement, this.ctx.config.feeBps);
    const holds = this.accounts.ensureSystemAccount(p.tenantId, "holds", p.currency);
    const postings: Posting[] = [debit(holds.id, amount)];
    if (S !== p.currency) {
      const clearP = this.accounts.ensureSystemAccount(p.tenantId, "fx_clearing", p.currency);
      const clearS = this.accounts.ensureSystemAccount(p.tenantId, "fx_clearing", S);
      postings.push(credit(clearP.id, amount), debit(clearS.id, settlement));
    }
    postings.push(credit(p.merchantAccountId, money(settlement.amount - fee.amount, S)));
    if (fee.amount > 0) {
      const fees = this.accounts.ensureSystemAccount(p.tenantId, "fees", S);
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
      settlementAmount: settlement.amount,
      capturedAt: this.ctx.clock.now(),
      entryIds: [...p.entryIds, entry.id],
    });
    this.ctx.bus.publish("payment.captured", { paymentId: p.id, amount: amount.amount, fee: fee.amount }, p.tenantId);
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
    const refundedAmount = p.refundedAmount + amountMinor;
    const S = p.settlementCurrency;
    const settled = p.settlementAmount ?? p.capturedAmount;
    const settlementRefund =
      S === p.currency
        ? amountMinor
        : refundedAmount === p.capturedAmount
          ? settled - p.settlementRefunded
          : Number(divRound(BigInt(amountMinor) * BigInt(settled), BigInt(p.capturedAmount), "half-even"));
    const postings: Posting[] = [debit(p.merchantAccountId, money(settlementRefund, S))];
    if (S !== p.currency) {
      const clearP = this.accounts.ensureSystemAccount(p.tenantId, "fx_clearing", p.currency);
      const clearS = this.accounts.ensureSystemAccount(p.tenantId, "fx_clearing", S);
      postings.push(credit(clearS.id, money(settlementRefund, S)), debit(clearP.id, amount));
    }
    postings.push(credit(p.customerAccountId, amount));
    const entry = this.journal.post({
      tenantId: p.tenantId,
      description: `Refund ${p.id}`,
      postings,
      metadata: { paymentId: p.id, kind: "refund" },
    });
    const updated = this.ctx.repos.payments.update(p.id, {
      refundedAmount,
      settlementRefunded: p.settlementRefunded + settlementRefund,
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
