import type { Account } from "../domain/account";
import type { JournalEntry } from "../domain/journal";
import type { Payment } from "../domain/payment";
import { toIso } from "../lib/time";
import type { Statement } from "../services/statementService";

// Wire format: timestamps as ISO strings, money as integer minor units.

export function serializeAccount(a: Account) {
  return {
    id: a.id,
    name: a.name,
    code: a.code ?? null,
    type: a.type,
    currency: a.currency,
    status: a.status,
    allowNegative: a.allowNegative,
    createdAt: toIso(a.createdAt),
    closedAt: a.closedAt !== undefined ? toIso(a.closedAt) : null,
    metadata: a.metadata,
  };
}

export function serializeEntry(e: JournalEntry) {
  return {
    id: e.id,
    postedAt: toIso(e.postedAt),
    createdAt: toIso(e.createdAt),
    description: e.description,
    postings: e.postings.map((p) => ({ ...p })),
    metadata: e.metadata,
    reversalOf: e.reversalOf ?? null,
    reversedBy: e.reversedBy ?? null,
  };
}

export function serializePayment(p: Payment) {
  return {
    id: p.id,
    status: p.status,
    customerAccountId: p.customerAccountId,
    merchantAccountId: p.merchantAccountId,
    amount: p.amount,
    currency: p.currency,
    capturedAmount: p.capturedAmount,
    refundedAmount: p.refundedAmount,
    feeAmount: p.feeAmount,
    reference: p.reference ?? null,
    authorizedAt: toIso(p.authorizedAt),
    expiresAt: toIso(p.expiresAt),
    capturedAt: p.capturedAt !== undefined ? toIso(p.capturedAt) : null,
    refunds: p.refunds.map((r) => ({ id: r.id, amount: r.amount, at: toIso(r.at) })),
  };
}

export function serializeStatement(s: Statement) {
  return {
    accountId: s.account.id,
    currency: s.account.currency,
    from: toIso(s.from),
    to: toIso(s.to),
    opening: s.opening.amount,
    closing: s.closing.amount,
    lines: s.lines.map((l) => ({ ...l, postedAt: toIso(l.postedAt) })),
  };
}
