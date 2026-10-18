import type { AccountType } from "../domain/account";
import type { BalanceService } from "./balanceService";
import type { ServiceContext } from "./index";

export interface TrialBalanceRow {
  accountId: string;
  name: string;
  code?: string;
  type: AccountType;
  currency: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceTotal {
  currency: string;
  debit: number;
  credit: number;
  balanced: boolean;
}

export interface TrialBalance {
  tenantId: string;
  asOf: number;
  rows: TrialBalanceRow[];
  totals: TrialBalanceTotal[];
}

export class ReportService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly balances: BalanceService,
  ) {}

  /**
   * Classic trial balance: every account's debit-minus-credit balance placed in
   * the debit or credit column, with totals per currency (we never add USD to
   * EUR). Zero-balance accounts are omitted unless includeZero is set.
   */
  trialBalance(tenantId: string, opts: { asOf?: number; includeZero?: boolean } = {}): TrialBalance {
    const asOf = opts.asOf ?? this.ctx.clock.now();
    const rows: TrialBalanceRow[] = [];
    const totals = new Map<string, TrialBalanceTotal>();
    for (const acct of this.ctx.repos.accounts.listByTenant(tenantId)) {
      const bal = this.balances.getDebitBalance(acct.id, { asOf }).amount;
      if (bal === 0 && !opts.includeZero) continue;
      const row: TrialBalanceRow = {
        accountId: acct.id,
        name: acct.name,
        code: acct.code,
        type: acct.type,
        currency: acct.currency,
        debit: bal > 0 ? bal : 0,
        credit: bal < 0 ? -bal : 0,
      };
      rows.push(row);
      const t = totals.get(acct.currency) ?? { currency: acct.currency, debit: 0, credit: 0, balanced: true };
      t.debit += row.debit;
      t.credit += row.credit;
      t.balanced = t.debit === t.credit;
      totals.set(acct.currency, t);
    }
    return {
      tenantId,
      asOf,
      rows,
      totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    };
  }
}
