import { it, expect } from "testkit";
import { setup, TENANT } from "../helpers";

function authorized() {
  const s = setup();
  s.fund(s.wallet.id, 10000);
  const p = s.services.payments.authorize({ tenantId: TENANT, customerAccountId: s.wallet.id, merchantAccountId: s.merchant.id, amount: 10000, currency: "USD" });
  const sys = (kind: "holds" | "fees") => s.services.repos.accounts.findSystemAccount(TENANT, kind, "USD")!;
  return { ...s, paymentId: p.id, sys };
}

it("captures part of the authorization, charges the fee on it and releases the rest", () => {
  const { services, paymentId, wallet, merchant, balance, sys } = authorized();
  const p = services.payments.capture(paymentId, { amount: 6000 });
  expect(p).toMatchObject({ status: "captured", capturedAmount: 6000, feeAmount: 150 });
  expect(balance(wallet.id)).toBe(4000);
  expect(balance(sys("holds").id)).toBe(0);
  expect(balance(merchant.id)).toBe(5850);
  expect(balance(sys("fees").id)).toBe(150);
  const ev = services.audit.query({ type: "payment.captured" });
  expect(ev[0].payload).toMatchObject({ paymentId, amount: 6000, fee: 150, released: 4000 });
  expect(services.reports.trialBalance(TENANT).totals.every((t) => t.balanced)).toBe(true);
});

it("limits refunds to the captured amount", () => {
  const { services, paymentId, wallet, balance } = authorized();
  services.payments.capture(paymentId, { amount: 6000 });
  expect(() => services.payments.refund(paymentId, 6001)).toThrow();
  expect(services.payments.refund(paymentId, 6000).status).toBe("refunded");
  expect(balance(wallet.id)).toBe(10000);
});

it("validates the amount over the API and keeps full capture as the default", () => {
  const { call, paymentId, services, wallet, merchant, fund } = authorized();
  for (const amount of [0, -5, 10001, 2500.5]) {
    const res = call("POST", `/payments/${paymentId}/capture`, { amount });
    expect(res.status).toBe(400);
  }
  expect(() => services.payments.capture(paymentId, { amount: 10001 })).toThrow();
  const ok = call("POST", `/payments/${paymentId}/capture`, { amount: 2500 });
  expect(ok.status).toBe(200);
  expect(ok.body).toMatchObject({ capturedAmount: 2500, status: "captured" });

  fund(wallet.id, 300);
  const p2 = services.payments.authorize({ tenantId: TENANT, customerAccountId: wallet.id, merchantAccountId: merchant.id, amount: 300, currency: "USD" });
  const full = call("POST", `/payments/${p2.id}/capture`);
  expect(full.body).toMatchObject({ capturedAmount: 300 });
});
