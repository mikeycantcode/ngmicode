import { it, expect } from "testkit";
import { setup, TENANT } from "../helpers";

function captured() {
  const s = setup();
  s.fund(s.wallet.id, 10000);
  const p = s.services.payments.authorize({ tenantId: TENANT, customerAccountId: s.wallet.id, merchantAccountId: s.merchant.id, amount: 10000, currency: "USD" });
  s.services.payments.capture(p.id);
  return { ...s, paymentId: p.id };
}

it("rejects cumulative refunds beyond the captured amount without moving money", () => {
  const { services, paymentId, wallet, merchant, balance } = captured();
  services.payments.refund(paymentId, 6000);
  const before = [balance(wallet.id), balance(merchant.id)];
  expect(() => services.payments.refund(paymentId, 6000)).toThrow("4000");
  expect([balance(wallet.id), balance(merchant.id)]).toEqual(before);
  expect(services.payments.get(paymentId)).toMatchObject({ refundedAmount: 6000, status: "partially_refunded" });
  expect(services.payments.refund(paymentId, 4000).status).toBe("refunded");
  expect(() => services.payments.refund(paymentId, 1)).toThrow();
});

it("returns 400 over the API for an over-refund", () => {
  const { call, paymentId } = captured();
  expect(call("POST", `/payments/${paymentId}/refunds`, { amount: 6000 }, { "Idempotency-Key": "a" }).status).toBe(201);
  const res = call("POST", `/payments/${paymentId}/refunds`, { amount: 6000 }, { "Idempotency-Key": "b" });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: { code: "validation_error" } });
});
