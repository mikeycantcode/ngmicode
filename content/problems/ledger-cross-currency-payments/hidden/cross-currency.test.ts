import { it, expect } from "testkit";
import type { LedgerConfig } from "../../src/config";
import { credit, debit } from "../../src/domain/journal";
import { money } from "../../src/domain/money";
import { HOUR_MS } from "../../src/lib/time";
import { setup, TENANT } from "../helpers";

function eurCustomer(config: Partial<LedgerConfig> = {}) {
  const s = setup(config);
  const eurCash = s.services.accounts.open({ tenantId: TENANT, name: "EUR cash", type: "asset", currency: "EUR" });
  const eurWallet = s.services.accounts.open({ tenantId: TENANT, name: "Wallet: jean", type: "liability", currency: "EUR" });
  s.services.journal.post({
    tenantId: TENANT,
    description: "Top-up",
    postings: [debit(eurCash.id, money(20000, "EUR")), credit(eurWallet.id, money(20000, "EUR"))],
  });
  const authorize = (amount: number) =>
    s.services.payments.authorize({ tenantId: TENANT, customerAccountId: eurWallet.id, merchantAccountId: s.merchant.id, amount, currency: "EUR" });
  return { ...s, eurWallet, authorize };
}

it("captures at the capture-time rate with the fee in the settlement currency", () => {
  const { services, clock, authorize, merchant, eurWallet, balance } = eurCustomer();
  services.fx.setRate("EUR", "USD", "1.10");
  const p = authorize(10000);
  expect(p).toMatchObject({ currency: "EUR", settlementCurrency: "USD" });
  clock.advance(HOUR_MS);
  services.fx.setRate("EUR", "USD", "1.20");
  const c = services.payments.capture(p.id);
  expect(c).toMatchObject({ status: "captured", capturedAmount: 10000, settlementAmount: 12000, feeAmount: 300 });
  expect(balance(merchant.id)).toBe(11700);
  expect(balance(services.repos.accounts.findSystemAccount(TENANT, "fees", "USD")!.id)).toBe(300);
  expect(balance(services.repos.accounts.findSystemAccount(TENANT, "holds", "EUR")!.id)).toBe(0);
  expect(balance(eurWallet.id)).toBe(10000);
  const tb = services.reports.trialBalance(TENANT);
  expect(tb.totals.map((t) => [t.currency, t.balanced])).toEqual([["EUR", true], ["USD", true]]);
});

it("refunds at the locked rate and returns exactly the settled amount over split refunds", () => {
  const { services, clock, authorize, merchant, eurWallet, balance } = eurCustomer({ feeBps: 0 });
  services.fx.setRate("EUR", "USD", "1.5");
  const p = authorize(1000);
  services.payments.capture(p.id);
  expect(balance(merchant.id)).toBe(1500);
  clock.advance(HOUR_MS);
  services.fx.setRate("EUR", "USD", "2.0");
  services.payments.refund(p.id, 333);
  expect(balance(merchant.id)).toBe(1000); // 333 * 1.5 = 499.5 -> 500
  services.payments.refund(p.id, 333);
  const last = services.payments.refund(p.id, 334);
  expect(last.status).toBe("refunded");
  expect(balance(merchant.id)).toBe(0);
  expect(balance(eurWallet.id)).toBe(20000);
  expect(services.reports.trialBalance(TENANT).totals.every((t) => t.balanced)).toBe(true);
});

it("rejects capture without a rate, leaving the payment authorized, and exposes settlement over the API", () => {
  const { services, call, eurWallet, merchant } = eurCustomer();
  const created = call("POST", "/payments", { customerAccountId: eurWallet.id, merchantAccountId: merchant.id, amount: 5000, currency: "EUR" }, { "Idempotency-Key": "eu-1" });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ currency: "EUR", settlementCurrency: "USD", settlementAmount: null });
  const id = (created.body as { id: string }).id;
  const entriesBefore = services.repos.journal.count();
  const res = call("POST", `/payments/${id}/capture`);
  expect(res.status).toBe(422);
  expect(res.body).toMatchObject({ error: { code: "no_rate" } });
  expect(services.payments.get(id).status).toBe("authorized");
  expect(services.repos.journal.count()).toBe(entriesBefore);
  services.fx.setRate("EUR", "USD", "1.08");
  expect(call("POST", `/payments/${id}/capture`).body).toMatchObject({ settlementAmount: 5400, feeAmount: 135 });
});
