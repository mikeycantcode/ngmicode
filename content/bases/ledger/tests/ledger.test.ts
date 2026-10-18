import { describe, it, expect } from "testkit";
import { InsufficientFundsError, UnbalancedEntryError } from "../src/domain/errors";
import { credit, debit } from "../src/domain/journal";
import { money } from "../src/domain/money";
import { DAY_MS, HOUR_MS } from "../src/lib/time";
import { setup, TENANT } from "./helpers";

describe("journal", () => {
  it("posts a balanced entry and updates normal-side balances", () => {
    const { cash, wallet, fund, balance } = setup();
    fund(wallet.id, 5000);
    expect(balance(cash.id)).toBe(5000);
    expect(balance(wallet.id)).toBe(5000);
  });

  it("rejects unbalanced entries per currency", () => {
    const { services, cash, wallet } = setup();
    expect(() =>
      services.journal.post({
        tenantId: TENANT,
        description: "bad",
        postings: [debit(cash.id, money(100, "USD")), credit(wallet.id, money(99, "USD"))],
      }),
    ).toThrow(UnbalancedEntryError);
  });

  it("does not let a wallet go negative", () => {
    const { services, cash, wallet, fund } = setup();
    fund(wallet.id, 100);
    expect(() =>
      services.journal.post({
        tenantId: TENANT,
        description: "withdrawal",
        postings: [debit(wallet.id, money(101, "USD")), credit(cash.id, money(101, "USD"))],
      }),
    ).toThrow(InsufficientFundsError);
  });

  it("rejects postings to another tenant's account", () => {
    const { services, cash } = setup();
    const other = services.accounts.open({ tenantId: "tenant_other", name: "x", type: "asset", currency: "USD" });
    expect(() =>
      services.journal.post({
        tenantId: TENANT,
        description: "sneaky",
        postings: [debit(cash.id, money(1, "USD")), credit(other.id, money(1, "USD"))],
      }),
    ).toThrow("does not belong to tenant");
  });

  it("reverses an entry exactly once", () => {
    const { services, clock, wallet, fund, balance } = setup();
    const e = fund(wallet.id, 700);
    clock.advance(HOUR_MS);
    const r = services.journal.reverse(e.id, "duplicate");
    expect(r.reversalOf).toBe(e.id);
    expect(services.journal.get(e.id).reversedBy).toBe(r.id);
    expect(balance(wallet.id)).toBe(0);
    expect(() => services.journal.reverse(e.id, "again")).toThrow("already reversed");
    expect(() => services.journal.reverse(r.id, "nope")).toThrow("itself a reversal");
  });

  it("emits entry.posted to the audit log", () => {
    const { services, wallet, fund } = setup();
    fund(wallet.id, 1);
    const events = services.audit.query({ tenantId: TENANT, type: "entry.posted" });
    expect(events).toHaveLength(1);
  });
});

describe("balances and statements", () => {
  it("respects asOf (inclusive)", () => {
    const { clock, wallet, fund, balance } = setup();
    const t0 = clock.now();
    fund(wallet.id, 100);
    clock.advance(DAY_MS);
    fund(wallet.id, 50);
    expect(balance(wallet.id, t0 - 1)).toBe(0);
    expect(balance(wallet.id, t0)).toBe(100);
    expect(balance(wallet.id)).toBe(150);
  });

  it("builds a statement with running balances", () => {
    const { services, clock, cash, wallet, fund } = setup();
    const start = clock.now();
    fund(wallet.id, 1000);
    clock.advance(DAY_MS);
    fund(wallet.id, 500);
    clock.advance(DAY_MS);
    services.journal.post({
      tenantId: TENANT,
      description: "Withdrawal",
      postings: [debit(wallet.id, money(300, "USD")), credit(cash.id, money(300, "USD"))],
    });
    const s = services.statements.getStatement(wallet.id, { from: start + DAY_MS, to: clock.now() });
    expect(s.opening.amount).toBe(1000);
    expect(s.lines.map((l) => l.balance)).toEqual([1500, 1200]);
    expect(s.closing.amount).toBe(1200);
  });

  it("produces a balanced trial balance per currency", () => {
    const { services, wallet, fund } = setup();
    fund(wallet.id, 2500);
    const eurCash = services.accounts.open({ tenantId: TENANT, name: "EUR cash", type: "asset", currency: "EUR" });
    const equity = services.accounts.open({ tenantId: TENANT, name: "Capital", type: "equity", currency: "EUR" });
    services.journal.post({
      tenantId: TENANT,
      description: "Seed",
      postings: [debit(eurCash.id, money(900, "EUR")), credit(equity.id, money(900, "EUR"))],
    });
    const tb = services.reports.trialBalance(TENANT);
    expect(tb.totals).toEqual([
      { currency: "EUR", debit: 900, credit: 900, balanced: true },
      { currency: "USD", debit: 2500, credit: 2500, balanced: true },
    ]);
    const walletRow = tb.rows.find((r) => r.accountId === wallet.id)!;
    expect(walletRow).toMatchObject({ debit: 0, credit: 2500 });
  });
});
