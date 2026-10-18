import type { Account, SystemAccountKind } from "../domain/account";
import { systemAccountCode } from "../domain/account";
import { compareEntries, JournalEntry } from "../domain/journal";
import type { Payment, PaymentStatus } from "../domain/payment";
import { InMemoryTable } from "./table";


export class AccountRepo {
  private table = new InMemoryTable<Account>("account");

  insert(a: Account): Account {
    return this.table.insert(a);
  }

  get(id: string): Account | undefined {
    return this.table.get(id);
  }

  require(id: string): Account {
    return this.table.require(id);
  }

  update(id: string, patch: Partial<Account>): Account {
    return this.table.update(id, patch);
  }

  listByTenant(tenantId: string): Account[] {
    return this.table.list((a) => a.tenantId === tenantId).sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  findByCode(tenantId: string, code: string): Account | undefined {
    return this.table.list((a) => a.tenantId === tenantId && a.code === code)[0];
  }

  findSystemAccount(tenantId: string, kind: SystemAccountKind, currency: string): Account | undefined {
    return this.findByCode(tenantId, systemAccountCode(kind, currency));
  }
}


/**
 * Journal entries plus a secondary index accountId -> entry ids. Entries are
 * append-only: the only mutation allowed is stamping `reversedBy`.
 */
export class JournalRepo {
  private table = new InMemoryTable<JournalEntry>("journal entry");
  private byAccount = new Map<string, string[]>();

  insert(entry: JournalEntry): JournalEntry {
    const saved = this.table.insert(entry);
    const seen = new Set<string>();
    for (const p of entry.postings) {
      if (seen.has(p.accountId)) continue;
      seen.add(p.accountId);
      const ids = this.byAccount.get(p.accountId) ?? [];
      ids.push(entry.id);
      this.byAccount.set(p.accountId, ids);
    }
    return saved;
  }

  get(id: string): JournalEntry | undefined {
    return this.table.get(id);
  }

  require(id: string): JournalEntry {
    return this.table.require(id);
  }

  markReversed(id: string, reversalId: string): JournalEntry {
    return this.table.update(id, { reversedBy: reversalId });
  }

  /** All entries touching the account, ordered by (postedAt, id). */
  listForAccount(accountId: string): JournalEntry[] {
    const ids = this.byAccount.get(accountId) ?? [];
    return ids.map((id) => this.table.require(id)).sort(compareEntries);
  }

  listByTenant(tenantId: string): JournalEntry[] {
    return this.table.list((e) => e.tenantId === tenantId).sort(compareEntries);
  }

  count(): number {
    return this.table.size();
  }
}


export class PaymentRepo {
  private table = new InMemoryTable<Payment>("payment");

  insert(p: Payment): Payment {
    return this.table.insert(p);
  }

  get(id: string): Payment | undefined {
    return this.table.get(id);
  }

  require(id: string): Payment {
    return this.table.require(id);
  }

  update(id: string, patch: Partial<Payment>): Payment {
    return this.table.update(id, patch);
  }

  listByTenant(tenantId: string): Payment[] {
    return this.table.list((p) => p.tenantId === tenantId);
  }

  listByStatus(status: PaymentStatus): Payment[] {
    return this.table.list((p) => p.status === status);
  }
}

export interface FxRate {
  base: string;
  quote: string;
  /** Decimal string: 1 unit of base = `rate` units of quote. e.g. EUR/USD "1.0850". */
  rate: string;
  effectiveAt: number;
}

/** Rate history per currency pair, kept sorted by effectiveAt. */
export class FxRateRepo {
  private byPair = new Map<string, FxRate[]>();

  private key(base: string, quote: string): string {
    return `${base}/${quote}`;
  }

  put(rate: FxRate): void {
    const k = this.key(rate.base, rate.quote);
    const list = (this.byPair.get(k) ?? []).filter((r) => r.effectiveAt !== rate.effectiveAt);
    list.push({ ...rate });
    list.sort((a, b) => a.effectiveAt - b.effectiveAt);
    this.byPair.set(k, list);
  }

  /** Latest rate for the exact pair with effectiveAt <= at, or undefined. */
  findLatest(base: string, quote: string, at: number): FxRate | undefined {
    const list = this.byPair.get(this.key(base, quote)) ?? [];
    let found: FxRate | undefined;
    for (const r of list) {
      if (r.effectiveAt <= at) found = r;
      else break;
    }
    return found ? { ...found } : undefined;
  }

  history(base: string, quote: string): FxRate[] {
    return (this.byPair.get(this.key(base, quote)) ?? []).map((r) => ({ ...r }));
  }
}

export type IdempotencyState = "in_progress" | "completed";

export interface IdempotencyRecord {
  /** `${scope}:${key}` */
  id: string;
  fingerprint: string;
  state: IdempotencyState;
  response?: unknown;
  createdAt: number;
}

export class IdempotencyRepo {
  private records = new Map<string, IdempotencyRecord>();

  get(id: string): IdempotencyRecord | undefined {
    const r = this.records.get(id);
    return r ? { ...r } : undefined;
  }

  put(record: IdempotencyRecord): void {
    this.records.set(record.id, { ...record });
  }

  delete(id: string): void {
    this.records.delete(id);
  }

  size(): number {
    return this.records.size;
  }
}


export interface Repos {
  accounts: AccountRepo;
  journal: JournalRepo;
  payments: PaymentRepo;
  fxRates: FxRateRepo;
  idempotency: IdempotencyRepo;
}

export function createRepos(): Repos {
  return {
    accounts: new AccountRepo(),
    journal: new JournalRepo(),
    payments: new PaymentRepo(),
    fxRates: new FxRateRepo(),
    idempotency: new IdempotencyRepo(),
  };
}
