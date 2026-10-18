import { signedAmount } from "../domain/account";
import { Money, money } from "../domain/money";
import type { ServiceContext } from "./index";

export interface BalanceOptions {
  /** Inclusive upper bound on postedAt. Defaults to "everything". */
  asOf?: number;
}

export class BalanceService {
  constructor(private readonly ctx: ServiceContext) {}

  /**
   * Balance of an account on its NORMAL side (see domain/account.ts), counting
   * every entry with postedAt <= asOf. Reversed entries are still counted —
   * their reversal entry nets them out from the reversal's postedAt onward.
   */
  getBalance(accountId: string, opts: BalanceOptions = {}): Money {
    const account = this.ctx.repos.accounts.require(accountId);
    const asOf = opts.asOf ?? Number.POSITIVE_INFINITY;
    let total = 0;
    for (const entry of this.ctx.repos.journal.listForAccount(accountId)) {
      if (entry.postedAt > asOf) break; // sorted by postedAt
      for (const p of entry.postings) {
        if (p.accountId === accountId) total += signedAmount(account.type, p.direction, p.amount);
      }
    }
    return money(total, account.currency);
  }

  /**
   * Debit-minus-credit balance regardless of account type. Used by the trial
   * balance, which needs to know which column a balance falls into.
   */
  getDebitBalance(accountId: string, opts: BalanceOptions = {}): Money {
    const account = this.ctx.repos.accounts.require(accountId);
    const asOf = opts.asOf ?? Number.POSITIVE_INFINITY;
    let total = 0;
    for (const entry of this.ctx.repos.journal.listForAccount(accountId)) {
      if (entry.postedAt > asOf) break;
      for (const p of entry.postings) {
        if (p.accountId === accountId) total += p.direction === "debit" ? p.amount : -p.amount;
      }
    }
    return money(total, account.currency);
  }
}
