import type { Account } from "../domain/account";
import { ValidationError } from "../domain/errors";
import { Money, money } from "../domain/money";
import type { BalanceService } from "./balanceService";
import type { ServiceContext } from "./index";

export interface StatementLine {
  entryId: string;
  postedAt: number;
  description: string;
  /** Signed change to the normal-side balance. */
  change: number;
  /** Running normal-side balance after this line. */
  balance: number;
}

export interface Statement {
  account: Account;
  from: number;
  to: number;
  opening: Money;
  closing: Money;
  lines: StatementLine[];
}

export class StatementService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly balances: BalanceService,
  ) {}

  /**
   * Account statement for [from, to] (both inclusive, epoch ms). The opening
   * balance is everything strictly before `from`; each line shows the running
   * balance, so closing === getBalance(accountId, { asOf: to }).
   */
  getStatement(accountId: string, range: { from: number; to: number }): Statement {
    const { from, to } = range;
    if (!(from <= to)) throw new ValidationError("statement range must have from <= to");
    const account = this.ctx.repos.accounts.require(accountId);
    // Opening balance = everything up to the start of the period.
    const opening = this.balances.getBalance(accountId, { asOf: from });

    let running = opening.amount;
    const lines: StatementLine[] = [];
    for (const entry of this.ctx.repos.journal.listForAccount(accountId)) {
      if (entry.postedAt < from) continue;
      if (entry.postedAt > to) break;
      let change = 0;
      for (const p of entry.postings) {
        if (p.accountId !== accountId) continue;
        // debits increase, credits decrease
        change += p.direction === "debit" ? p.amount : -p.amount;
      }
      running += change;
      lines.push({ entryId: entry.id, postedAt: entry.postedAt, description: entry.description, change, balance: running });
    }
    return { account, from, to, opening, closing: money(running, account.currency), lines };
  }
}
