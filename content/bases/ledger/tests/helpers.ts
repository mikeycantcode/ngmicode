import { ALL_SCOPES } from "../src/api/auth";
import type { ApiResponse, HttpMethod } from "../src/api/http";
import { createLedgerApp } from "../src/app";
import type { LedgerConfig } from "../src/config";
import { credit, debit } from "../src/domain/journal";
import { money } from "../src/domain/money";
import { manualClock } from "../src/lib/clock";

export const TENANT = "tenant_acme";
export const API_KEY = "sk_test_acme";

/**
 * Fresh app with a manual clock (2024-01-01T00:00Z), one tenant with a
 * full-scope API key, and the usual accounts:
 *   cash      asset      USD  (code 1000)
 *   wallet    liability  USD  customer wallet, cannot go negative (code 2100)
 *   merchant  liability  USD  merchant payable, may go negative (code 2200)
 */
export function setup(config: Partial<LedgerConfig> = {}) {
  const clock = manualClock();
  const app = createLedgerApp({ clock, config });
  app.apiKeys.register(API_KEY, { tenantId: TENANT, scopes: ALL_SCOPES });
  const { accounts, journal } = app.services;
  const cash = accounts.open({ tenantId: TENANT, name: "Operating cash", type: "asset", currency: "USD", code: "1000" });
  const wallet = accounts.open({ tenantId: TENANT, name: "Wallet: alice", type: "liability", currency: "USD", code: "2100" });
  const merchant = accounts.open({
    tenantId: TENANT,
    name: "Payable: Bob's Bikes",
    type: "liability",
    currency: "USD",
    code: "2200",
    allowNegative: true,
  });

  /** Customer top-up: Dr cash, Cr wallet. */
  const fund = (accountId: string, amount: number, postedAt?: number) =>
    journal.post({
      tenantId: TENANT,
      description: "Top-up",
      postings: [debit(cash.id, money(amount, "USD")), credit(accountId, money(amount, "USD"))],
      postedAt,
    });

  const call = (method: HttpMethod, path: string, body?: unknown, headers: Record<string, string> = {}): ApiResponse =>
    app.handle({ method, path, body, headers: { authorization: `Bearer ${API_KEY}`, ...headers } });

  const balance = (accountId: string, asOf?: number) => app.services.balances.getBalance(accountId, { asOf }).amount;

  return { app, clock, cash, wallet, merchant, fund, call, balance, services: app.services };
}
