import { it, expect } from "testkit";
import { setup } from "../helpers";

it("releases the key when the operation fails so a retry can succeed", () => {
  const { services, call, wallet, merchant, fund } = setup();
  expect(() => services.idempotency.run("t", "k", {}, () => { throw new Error("timeout"); })).toThrow("timeout");
  expect(services.idempotency.run("t", "k", {}, () => 42)).toEqual({ value: 42, replayed: false });

  const body = { customerAccountId: wallet.id, merchantAccountId: merchant.id, amount: 900, currency: "USD" };
  expect(call("POST", "/payments", body, { "Idempotency-Key": "ord-9" }).status).toBe(422);
  fund(wallet.id, 900);
  expect(call("POST", "/payments", body, { "Idempotency-Key": "ord-9" }).status).toBe(201);
});

it("fingerprints requests independently of key order", () => {
  const { services, call, wallet, merchant, fund } = setup();
  const a = services.idempotency.run("t", "k", { x: 1, y: { p: [1, 2], q: "z" } }, () => "first");
  const b = services.idempotency.run("t", "k", { y: { q: "z", p: [1, 2] }, x: 1 }, () => "second");
  expect([a.value, b.replayed, b.value]).toEqual(["first", true, "first"]);

  fund(wallet.id, 1000);
  const first = call("POST", "/payments", { customerAccountId: wallet.id, merchantAccountId: merchant.id, amount: 300, currency: "USD" }, { "Idempotency-Key": "sdk" });
  const retry = call("POST", "/payments", { currency: "USD", amount: 300, merchantAccountId: merchant.id, customerAccountId: wallet.id }, { "Idempotency-Key": "sdk" });
  expect(retry.status).toBe(201);
  expect(retry.body).toEqual(first.body);
});

it("still rejects in-progress duplicates and real mismatches", () => {
  const { services } = setup();
  expect(() => services.idempotency.run("t", "k", {}, () => services.idempotency.run("t", "k", {}, () => 1))).toThrow("still in progress");
  services.idempotency.run("t", "m", { a: 1 }, () => 1);
  expect(() => services.idempotency.run("t", "m", { a: 2 }, () => 2)).toThrow("different request");
});
