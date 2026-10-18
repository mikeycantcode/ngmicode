import { isSupportedCurrency } from "./currency";
import { UnbalancedEntryError, ValidationError } from "./errors";
import type { Money } from "./money";

export type Direction = "debit" | "credit";

export interface Posting {
  accountId: string;
  direction: Direction;
  /** Positive integer minor units. Direction carries the sign. */
  amount: number;
  currency: string;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  /** Accounting time: the moment the entry affects balances. */
  postedAt: number;
  /** Wall-clock time the row was written. */
  createdAt: number;
  description: string;
  postings: Posting[];
  metadata: Record<string, string>;
  /** Set on a reversal: the id of the entry it reverses. */
  reversalOf?: string;
  /** Set on an original once it has been reversed. */
  reversedBy?: string;
}

export interface EntryDraft {
  tenantId: string;
  description: string;
  postings: Posting[];
  /** Defaults to clock.now() in JournalService.post. */
  postedAt?: number;
  metadata?: Record<string, string>;
  reversalOf?: string;
}

export function debit(accountId: string, m: Money): Posting {
  return { accountId, direction: "debit", amount: m.amount, currency: m.currency };
}

export function credit(accountId: string, m: Money): Posting {
  return { accountId, direction: "credit", amount: m.amount, currency: m.currency };
}

export function invertPostings(postings: Posting[]): Posting[] {
  return postings.map((p) => ({ ...p, direction: p.direction === "debit" ? "credit" : "debit" }));
}

/**
 * Structural validation of a draft: shape, positive integer amounts, supported
 * currencies, and the double-entry rule — debits equal credits PER CURRENCY.
 * Account existence/ownership is checked by JournalService.
 */
export function validateDraft(draft: EntryDraft): void {
  if (!draft.tenantId) throw new ValidationError("entry tenantId is required");
  if (typeof draft.description !== "string" || draft.description.trim() === "") {
    throw new ValidationError("entry description is required", { field: "description" });
  }
  if (!Array.isArray(draft.postings) || draft.postings.length < 2) {
    throw new ValidationError("an entry needs at least two postings", { field: "postings" });
  }
  const totals = new Map<string, { debit: number; credit: number }>();
  draft.postings.forEach((p, i) => {
    if (!p || typeof p.accountId !== "string" || p.accountId === "") {
      throw new ValidationError(`postings[${i}].accountId is required`, { field: `postings[${i}].accountId` });
    }
    if (p.direction !== "debit" && p.direction !== "credit") {
      throw new ValidationError(`postings[${i}].direction must be debit or credit`, { field: `postings[${i}].direction` });
    }
    if (!Number.isSafeInteger(p.amount) || p.amount <= 0) {
      throw new ValidationError(`postings[${i}].amount must be a positive integer`, { field: `postings[${i}].amount` });
    }
    if (!isSupportedCurrency(p.currency)) {
      throw new ValidationError(`postings[${i}].currency is not supported`, { field: `postings[${i}].currency` });
    }
    const t = totals.get(p.currency) ?? { debit: 0, credit: 0 };
    t[p.direction] += p.amount;
    totals.set(p.currency, t);
  });
  for (const [currency, t] of totals) {
    if (t.debit !== t.credit) {
      throw new UnbalancedEntryError(`entry is unbalanced in ${currency}: debits ${t.debit} != credits ${t.credit}`, {
        currency,
        debit: t.debit,
        credit: t.credit,
      });
    }
  }
}

/** Sort key used everywhere entries are listed: postedAt, then id. */
export function compareEntries(a: JournalEntry, b: JournalEntry): number {
  return a.postedAt - b.postedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
