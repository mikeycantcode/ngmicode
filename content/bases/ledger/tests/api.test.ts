import { describe, it, expect } from "testkit";
import { READ_ONLY_SCOPES } from "../src/api/auth";
import { setup } from "./helpers";

describe("api", () => {
  it("requires a valid API key", () => {
    const { app } = setup();
    expect(app.handle({ method: "GET", path: "/accounts" }).status).toBe(401);
    expect(app.handle({ method: "GET", path: "/accounts", headers: { Authorization: "Bearer nope" } }).status).toBe(401);
  });

  it("creates accounts and validates input", () => {
    const { call } = setup();
    const ok = call("POST", "/accounts", { name: "Wallet: carol", type: "liability", currency: "EUR" });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ type: "liability", currency: "EUR", status: "open" });
    const bad = call("POST", "/accounts", { name: "x", type: "liability", currency: "DOGE" });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ error: { code: "validation_error", details: { field: "currency" } } });
  });

  it("runs a payment end to end with idempotent creation", () => {
    const { call, fund, wallet, merchant } = setup();
    fund(wallet.id, 5000);
    const body = { customerAccountId: wallet.id, merchantAccountId: merchant.id, amount: 2000, currency: "USD" };
    expect(call("POST", "/payments", body).status).toBe(400); // missing Idempotency-Key
    const first = call("POST", "/payments", body, { "Idempotency-Key": "order-1" });
    const again = call("POST", "/payments", body, { "Idempotency-Key": "order-1" });
    expect(first.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(again.headers).toEqual({ "idempotent-replayed": "true" });
    const id = (first.body as { id: string }).id;
    expect(call("POST", `/payments/${id}/capture`).status).toBe(200);
    const refund = call("POST", `/payments/${id}/refunds`, { amount: 500 }, { "Idempotency-Key": "rf-1" });
    expect(refund.status).toBe(201);
    expect(refund.body).toMatchObject({ status: "partially_refunded", refundedAmount: 500 });
    const bal = call("GET", `/accounts/${wallet.id}/balance`);
    expect(bal.body).toMatchObject({ amount: 3500, currency: "USD" });
  });

  it("enforces scopes", () => {
    const { app, wallet } = setup();
    app.apiKeys.register("sk_ro", { tenantId: "tenant_acme", scopes: READ_ONLY_SCOPES });
    const headers = { authorization: "Bearer sk_ro" };
    expect(app.handle({ method: "GET", path: `/accounts/${wallet.id}`, headers }).status).toBe(200);
    expect(app.handle({ method: "POST", path: "/accounts", headers, body: {} }).status).toBe(403);
  });

  it("hides other tenants' accounts", () => {
    const { app, wallet } = setup();
    app.apiKeys.register("sk_other", { tenantId: "tenant_other", scopes: READ_ONLY_SCOPES });
    const res = app.handle({ method: "GET", path: `/accounts/${wallet.id}`, headers: { authorization: "Bearer sk_other" } });
    expect(res.status).toBe(404);
  });

  it("returns statements over HTTP", () => {
    const { call, fund, wallet } = setup();
    fund(wallet.id, 1200);
    const res = call("GET", `/accounts/${wallet.id}/statement?from=2024-01-01&to=2024-01-31T23:59:59Z`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ opening: 0, closing: 1200 });
  });
});
