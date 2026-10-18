import { it, expect } from "testkit";
import { credit, debit } from "../../src/domain/journal";
import { money } from "../../src/domain/money";
import { DAY_MS } from "../../src/lib/time";
import { setup, TENANT } from "../helpers";

const JAN_31_END = "2024-01-31T23:59:59.999Z";

function inFeb() {
  const s = setup();
  s.clock.set(Date.UTC(2024, 0, 10));
  const jan = s.fund(s.wallet.id, 1000);
  s.clock.set(Date.UTC(2024, 1, 10));
  const entry = (postedAt: string) => ({
    description: "Accrual",
    postedAt,
    postings: [
      { accountId: s.cash.id, direction: "debit", amount: 50, currency: "USD" },
      { accountId: s.wallet.id, direction: "credit", amount: 50, currency: "USD" },
    ],
  });
  return { ...s, jan, entry };
}

it("blocks back-dated API postings into a closed period (inclusive) and reports the close", () => {
  const { call, entry, balance, wallet } = inFeb();
  expect(call("GET", "/periods").body).toEqual({ closedThrough: null });
  expect(call("POST", "/journal/entries", entry("2024-01-31T12:00:00Z")).status).toBe(201);
  const closed = call("POST", "/periods/close", { through: JAN_31_END });
  expect(closed.status).toBe(200);
  expect(closed.body).toEqual({ closedThrough: JAN_31_END });
  expect(call("GET", "/periods").body).toEqual({ closedThrough: JAN_31_END });

  const before = balance(wallet.id);
  const res = call("POST", "/journal/entries", entry(JAN_31_END));
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ error: { code: "period_closed" } });
  expect(balance(wallet.id)).toBe(before);
  expect(call("POST", "/journal/entries", entry("2024-02-01T00:00:00Z")).status).toBe(201);
});

it("guards the bulk import path atomically", () => {
  const { services, cash, wallet, balance } = inFeb();
  services.periods.close(TENANT, Date.UTC(2024, 0, 31, 23, 59, 59, 999));
  const draft = (postedAt: number) => ({
    tenantId: TENANT,
    description: "migrated",
    postedAt,
    postings: [debit(cash.id, money(10, "USD")), credit(wallet.id, money(10, "USD"))],
  });
  const before = balance(wallet.id);
  expect(() => services.journal.importEntries([draft(Date.UTC(2024, 1, 2)), draft(Date.UTC(2024, 0, 15))])).toThrow("period closed");
  expect(balance(wallet.id)).toBe(before);
  expect(services.journal.importEntries([draft(Date.UTC(2024, 1, 2))])).toHaveLength(1);
});

it("validates closes, isolates tenants, allows reversals and audits", () => {
  const { services, call, jan, clock } = inFeb();
  expect(call("POST", "/periods/close", { through: "2024-03-01T00:00:00Z" }).status).toBe(400);
  expect(call("POST", "/periods/close", { through: JAN_31_END }).status).toBe(200);
  expect(call("POST", "/periods/close", { through: "2024-01-15T00:00:00Z" }).status).toBe(409);
  expect(services.periods.closedThrough(TENANT)).toBe(Date.UTC(2024, 0, 31, 23, 59, 59, 999));

  const rev = services.journal.reverse(jan.id, "customer dispute");
  expect(rev.postedAt).toBe(clock.now());
  expect(services.audit.query({ tenantId: TENANT, type: "period.closed" })).toHaveLength(1);

  const other = services.accounts.open({ tenantId: "tenant_b", name: "c", type: "asset", currency: "USD" });
  const eq = services.accounts.open({ tenantId: "tenant_b", name: "e", type: "equity", currency: "USD" });
  const e = services.journal.post({
    tenantId: "tenant_b",
    description: "backdated ok",
    postedAt: clock.now() - 30 * DAY_MS,
    postings: [debit(other.id, money(5, "USD")), credit(eq.id, money(5, "USD"))],
  });
  expect(e.id).toBeDefined();
});
