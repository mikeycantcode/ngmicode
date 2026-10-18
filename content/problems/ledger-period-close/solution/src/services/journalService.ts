import { Account, signedAmount } from "../domain/account";
import { ConflictError, InsufficientFundsError, ValidationError } from "../domain/errors";
import { EntryDraft, invertPostings, JournalEntry, validateDraft } from "../domain/journal";
import { deepClone } from "../lib/objects";
import type { BalanceService } from "./balanceService";
import type { ServiceContext } from "./index";
import type { PeriodService } from "./periodService";

export class JournalService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly balances: BalanceService,
    private readonly periods: PeriodService,
  ) {}

  /**
   * The single write path for balanced entries. Validates the draft, checks
   * every account exists, is open, belongs to the tenant and matches the
   * posting currency, enforces allowNegative, persists, and emits entry.posted.
   */
  post(draft: EntryDraft): JournalEntry {
    validateDraft(draft);
    const now = this.ctx.clock.now();
    const postedAt = draft.postedAt ?? now;
    if (!Number.isSafeInteger(postedAt)) throw new ValidationError("postedAt must be epoch milliseconds");
    this.periods.assertOpen(draft.tenantId, postedAt);

    const accounts = this.loadAccounts(draft);
    this.checkFunds(draft, accounts);

    const entry: JournalEntry = {
      id: this.ctx.ids.next("je"),
      tenantId: draft.tenantId,
      postedAt,
      createdAt: now,
      description: draft.description.trim(),
      postings: deepClone(draft.postings),
      metadata: { ...(draft.metadata ?? {}) },
      ...(draft.reversalOf ? { reversalOf: draft.reversalOf } : {}),
    };
    const saved = this.ctx.repos.journal.insert(entry);
    this.ctx.bus.publish("entry.posted", { entryId: saved.id, postedAt: saved.postedAt }, saved.tenantId);
    return saved;
  }

  get(id: string): JournalEntry {
    return this.ctx.repos.journal.require(id);
  }

  /**
   * Reverses an entry by posting its mirror image NOW. The original is never
   * modified except for the reversedBy pointer, so historical balances
   * (asOf before the reversal) are unaffected.
   */
  reverse(entryId: string, reason: string): JournalEntry {
    const original = this.get(entryId);
    if (original.reversalOf) throw new ConflictError(`entry ${entryId} is itself a reversal`);
    if (original.reversedBy) throw new ConflictError(`entry ${entryId} was already reversed by ${original.reversedBy}`);
    const reversal = this.post({
      tenantId: original.tenantId,
      description: `Reversal of ${original.id}: ${reason || "no reason given"}`,
      postings: invertPostings(original.postings),
      metadata: { ...original.metadata, reversalReason: reason },
      reversalOf: original.id,
    });
    this.ctx.repos.journal.markReversed(original.id, reversal.id);
    this.ctx.bus.publish("entry.reversed", { entryId: original.id, reversalId: reversal.id }, original.tenantId);
    return reversal;
  }

  /**
   * Bulk import for the migration off the old ledger (see legacy/csvImport.ts).
   * Drafts must carry postedAt. Skips the funds check and per-entry events on
   * purpose: imported history is allowed to dip negative mid-stream, and the
   * audit consumer can't handle a backfill burst yet.
   * TODO(LEDG-212): emit entries.imported per batch once audit can page.
   */
  importEntries(drafts: EntryDraft[]): JournalEntry[] {
    // Validate the whole batch first so a rejected batch writes nothing.
    for (const draft of drafts) {
      validateDraft(draft);
      if (draft.postedAt === undefined) throw new ValidationError("imported entries must have postedAt");
      this.periods.assertOpen(draft.tenantId, draft.postedAt);
      this.loadAccounts(draft);
    }
    const out: JournalEntry[] = [];
    for (const draft of drafts) {
      if (draft.postedAt === undefined) continue;
      const entry: JournalEntry = {
        id: this.ctx.ids.next("je"),
        tenantId: draft.tenantId,
        postedAt: draft.postedAt,
        createdAt: this.ctx.clock.now(),
        description: draft.description.trim(),
        postings: deepClone(draft.postings),
        metadata: { ...(draft.metadata ?? {}), imported: "true" },
      };
      out.push(this.ctx.repos.journal.insert(entry));
    }
    this.ctx.log.info("imported entries", { count: out.length });
    return out;
  }

  private loadAccounts(draft: EntryDraft): Map<string, Account> {
    const accounts = new Map<string, Account>();
    for (const p of draft.postings) {
      if (accounts.has(p.accountId)) continue;
      const acct = this.ctx.repos.accounts.require(p.accountId);
      if (acct.tenantId !== draft.tenantId) {
        throw new ValidationError(`account ${acct.id} does not belong to tenant ${draft.tenantId}`);
      }
      if (acct.status !== "open") throw new ConflictError(`account ${acct.id} is closed`);
      accounts.set(acct.id, acct);
    }
    for (const p of draft.postings) {
      const acct = accounts.get(p.accountId)!;
      if (acct.currency !== p.currency) {
        throw new ValidationError(`posting currency ${p.currency} does not match account ${acct.id} (${acct.currency})`);
      }
    }
    return accounts;
  }

  private checkFunds(draft: EntryDraft, accounts: Map<string, Account>): void {
    const deltas = new Map<string, number>();
    for (const p of draft.postings) {
      const acct = accounts.get(p.accountId)!;
      deltas.set(acct.id, (deltas.get(acct.id) ?? 0) + signedAmount(acct.type, p.direction, p.amount));
    }
    for (const [id, delta] of deltas) {
      const acct = accounts.get(id)!;
      if (delta >= 0 || acct.allowNegative) continue;
      const available = this.balances.getBalance(id).amount;
      if (available + delta < 0) throw new InsufficientFundsError(id, available, -delta);
    }
  }
}
