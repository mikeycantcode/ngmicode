import type { LedgerConfig } from "../config";
import type { Clock, IdGenerator } from "../lib/clock";
import type { EventBus } from "../lib/events";
import type { Logger } from "../lib/log";
import type { Repos } from "../storage/repos";
import { AccountService } from "./accountService";
import { AuditLog } from "./auditLog";
import { BalanceService } from "./balanceService";
import { FxService } from "./fxService";
import { IdempotencyService } from "./idempotency";
import { JournalService } from "./journalService";
import { PaymentService } from "./paymentService";
import { ReportService } from "./reportService";
import { StatementService } from "./statementService";

/** Everything a service needs from the outside world. Built once in app.ts. */
export interface ServiceContext {
  clock: Clock;
  ids: IdGenerator;
  bus: EventBus;
  repos: Repos;
  config: LedgerConfig;
  log: Logger;
}

export interface Services {
  accounts: AccountService;
  balances: BalanceService;
  journal: JournalService;
  statements: StatementService;
  reports: ReportService;
  fx: FxService;
  payments: PaymentService;
  idempotency: IdempotencyService;
  audit: AuditLog;
  config: LedgerConfig;
  /** Escape hatch for read paths that need raw repository access. */
  repos: Repos;
}

export function createServices(ctx: ServiceContext): Services {
  const balances = new BalanceService(ctx);
  const accounts = new AccountService(ctx, balances);
  const journal = new JournalService(ctx, balances);
  return {
    accounts,
    balances,
    journal,
    statements: new StatementService(ctx, balances),
    reports: new ReportService(ctx, balances),
    fx: new FxService(ctx),
    payments: new PaymentService(ctx, accounts, journal),
    idempotency: new IdempotencyService(ctx),
    audit: new AuditLog(ctx.bus),
    repos: ctx.repos,
    config: ctx.config,
  };
}
