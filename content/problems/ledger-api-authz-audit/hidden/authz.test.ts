import { it, expect } from "testkit";
import { setup, TENANT } from "../helpers";

function twoTenants() {
  const s = setup();
  s.app.apiKeys.register("sk_evil", {
    tenantId: "tenant_evil",
    scopes: ["accounts:read", "accounts:write", "journal:write", "payments:read", "payments:write", "reports:read"],
  });
  const evil = (method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}) =>
    s.app.handle({ method, path, body, headers: { authorization: "Bearer sk_evil", ...headers } });
  return { ...s, evil };
}

it("does not expose another tenant's balance or statement", () => {
  const { evil, wallet, fund } = twoTenants();
  fund(wallet.id, 5000);
  expect(evil("GET", `/accounts/${wallet.id}/balance`).status).toBe(404);
  expect(evil("GET", `/accounts/${wallet.id}/statement?from=2024-01-01&to=2024-12-31`).status).toBe(404);
});

it("ignores a tenantId in the request body when posting entries", () => {
  const { evil, wallet, cash, fund, balance } = twoTenants();
  fund(wallet.id, 5000);
  const res = evil("POST", "/journal/entries", {
    tenantId: TENANT,
    description: "drain",
    postings: [
      { accountId: wallet.id, direction: "debit", amount: 5000, currency: "USD" },
      { accountId: cash.id, direction: "credit", amount: 5000, currency: "USD" },
    ],
  });
  expect(res.status).not.toBe(201);
  expect(balance(wallet.id)).toBe(5000);
});

it("requires journal:write to reverse entries", () => {
  const { app, wallet, fund } = twoTenants();
  const e = fund(wallet.id, 100);
  app.apiKeys.register("sk_onboarding", { tenantId: TENANT, scopes: ["accounts:read", "accounts:write"] });
  const res = app.handle({ method: "POST", path: `/journal/entries/${e.id}/reverse`, body: { reason: "x" }, headers: { authorization: "Bearer sk_onboarding" } });
  expect(res.status).toBe(403);
});

it("scopes idempotency keys per tenant", () => {
  const { call, evil, wallet, merchant, fund } = twoTenants();
  fund(wallet.id, 5000);
  const body = { customerAccountId: wallet.id, merchantAccountId: merchant.id, amount: 1000, currency: "USD" };
  const mine = call("POST", "/payments", body, { "Idempotency-Key": "order-1" });
  expect(mine.status).toBe(201);
  const stolen = evil("POST", "/payments", body, { "Idempotency-Key": "order-1" });
  expect(stolen.status).not.toBe(201);
  expect(JSON.stringify(stolen.body)).not.toContain((mine.body as { id: string }).id);

  const w = evil("POST", "/accounts", { name: "w", type: "liability", currency: "USD" }).body as { id: string };
  const m = evil("POST", "/accounts", { name: "m", type: "liability", currency: "USD", allowNegative: true }).body as { id: string };
  const c = evil("POST", "/accounts", { name: "c", type: "asset", currency: "USD" }).body as { id: string };
  evil("POST", "/journal/entries", {
    description: "seed",
    postings: [
      { accountId: c.id, direction: "debit", amount: 500, currency: "USD" },
      { accountId: w.id, direction: "credit", amount: 500, currency: "USD" },
    ],
  });
  const own = evil("POST", "/payments", { customerAccountId: w.id, merchantAccountId: m.id, amount: 500, currency: "USD" }, { "Idempotency-Key": "order-1" });
  expect(own.status).toBe(201);
});
