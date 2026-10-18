import {
  Account,
  ACCOUNT_TYPES,
  AccountType,
  SYSTEM_ACCOUNT_TYPES,
  SystemAccountKind,
  systemAccountCode,
} from "../domain/account";
import { getCurrency } from "../domain/currency";
import { ConflictError, ValidationError } from "../domain/errors";
import type { BalanceService } from "./balanceService";
import type { ServiceContext } from "./index";

export interface OpenAccountInput {
  tenantId: string;
  name: string;
  type: AccountType;
  currency: string;
  code?: string;
  allowNegative?: boolean;
  metadata?: Record<string, string>;
}

export class AccountService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly balances: BalanceService,
  ) {}

  open(input: OpenAccountInput): Account {
    if (!input.tenantId) throw new ValidationError("tenantId is required");
    if (!input.name || !input.name.trim()) throw new ValidationError("name is required", { field: "name" });
    if (!ACCOUNT_TYPES.includes(input.type)) throw new ValidationError(`invalid account type: ${input.type}`, { field: "type" });
    getCurrency(input.currency);
    if (input.code !== undefined) {
      if (input.code.startsWith("sys:")) throw new ValidationError("codes starting with sys: are reserved", { field: "code" });
      if (this.ctx.repos.accounts.findByCode(input.tenantId, input.code)) {
        throw new ConflictError(`account code ${input.code} already in use`);
      }
    }
    return this.insert({
      tenantId: input.tenantId,
      name: input.name.trim(),
      type: input.type,
      currency: input.currency,
      code: input.code,
      // Asset/expense accounts routinely go "negative" during corrections;
      // liabilities (customer wallets) must not unless explicitly allowed.
      allowNegative: input.allowNegative ?? (input.type !== "liability"),
      metadata: input.metadata ?? {},
    });
  }

  /** Per-tenant, per-currency system account, created on first use. */
  ensureSystemAccount(tenantId: string, kind: SystemAccountKind, currency: string): Account {
    const existing = this.ctx.repos.accounts.findSystemAccount(tenantId, kind, currency);
    if (existing) return existing;
    return this.insert({
      tenantId,
      name: `System ${kind} (${currency})`,
      type: SYSTEM_ACCOUNT_TYPES[kind],
      currency,
      code: systemAccountCode(kind, currency),
      allowNegative: true,
      metadata: { system: "true" },
    });
  }

  get(id: string): Account {
    return this.ctx.repos.accounts.require(id);
  }

  list(tenantId: string): Account[] {
    return this.ctx.repos.accounts.listByTenant(tenantId);
  }

  close(id: string): Account {
    const acct = this.get(id);
    if (acct.status === "closed") throw new ConflictError(`account ${id} is already closed`);
    const bal = this.balances.getBalance(id);
    if (bal.amount !== 0) throw new ConflictError(`account ${id} has a non-zero balance and cannot be closed`);
    const closed = this.ctx.repos.accounts.update(id, { status: "closed", closedAt: this.ctx.clock.now() });
    this.ctx.bus.publish("account.closed", { accountId: id }, acct.tenantId);
    return closed;
  }

  private insert(fields: Omit<Account, "id" | "status" | "createdAt">): Account {
    const account: Account = {
      ...fields,
      id: this.ctx.ids.next("acct"),
      status: "open",
      createdAt: this.ctx.clock.now(),
    };
    const saved = this.ctx.repos.accounts.insert(account);
    this.ctx.bus.publish("account.opened", { accountId: saved.id, type: saved.type, currency: saved.currency }, saved.tenantId);
    return saved;
  }
}
