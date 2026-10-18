# ledger

Double-entry ledger and payments core for the Tally wallet product. Every
balance in the company — customer wallets, merchant payables, fee revenue,
FX positions — is derived from journal entries in this service.

> Runs in-process with in-memory repositories. The Postgres adapter lives in
> `ledger-pg` and implements the same repo interfaces; nothing in `src/`
> should know which one is wired.

## Layout

```
src/
  domain/      pure types + rules: Money, Account, JournalEntry, Payment, errors
  lib/         clock & ids, events (EventBus), exact numerics, objects, time, log
  storage/     InMemoryTable + repositories (accounts, journal, payments, fx, idempotency)
  services/    business logic; all writes go through here
  api/         thin HTTP-ish layer: router, auth (API keys + scopes), validation,
               serializers, handlers/*
  legacy/      one-off migration code (CSV import) — do not build on it
  app.ts       composition root: createLedgerApp({ clock, config })
  config.ts    tunables (auth TTL, fee bps, idempotency TTL, page sizes)
tests/         visible test suite (testkit, jest-like)
```

## Conventions

- **Money is integer minor units + currency code** (`{ amount: 1050, currency: "USD" }`
  is $10.50). Exponents come from `domain/currency.ts` (JPY 0, KWD 3).
  Never use floats for money; fractional results go through `divRound`
  (`lib/numeric.ts`), half-even unless stated otherwise.
- **Double entry.** A `JournalEntry` has ≥ 2 postings; each posting has a
  direction and a positive amount. Debits must equal credits **per currency**.
  `JournalService.post` is the only sanctioned write path (validation,
  tenant/currency checks, insufficient-funds check, `entry.posted` event).
- **Normal-side balances.** Assets/expenses are debit-normal; liabilities,
  equity, revenue are credit-normal. `getBalance` reports on the normal side, so a
  funded customer wallet (liability) is positive. Use `signedAmount()` from
  `domain/account.ts`; don't hand-roll the sign logic.
- **Time.** `postedAt` is accounting time, `createdAt` is wall-clock. All
  `asOf` / range bounds are inclusive epoch ms. Services get time from the
  injected `Clock` — never `Date.now()`.
- **Immutability of history.** Entries are append-only. Corrections are
  reversals posted *now*; nothing may change a balance as of a past time.
- **Errors.** Throw `LedgerError` subclasses (`domain/errors.ts`); the API
  maps `code` → HTTP status in `api/http.ts`.
- **Events.** Services publish to the `EventBus`; the `AuditLog` subscribes to
  everything. Compliance needs every money movement in the audit log.
- **Repositories return copies.** Mutate only through `update()`.

## Multi-tenancy & API

Every account, entry and payment belongs to a tenant. API keys map to one tenant
and a set of scopes (`api/auth.ts`). Handlers must load resources through the
`loadOwned*` helpers, which 404 on cross-tenant access. Unsafe endpoints take an
`Idempotency-Key` header (required for payments/refunds), scoped per tenant.

| Method | Path | Scope |
| --- | --- | --- |
| POST | /accounts | accounts:write |
| GET | /accounts, /accounts/:id, /accounts/:id/balance?asOf, /accounts/:id/statement?from&to, /accounts/:id/entries | accounts:read |
| POST | /accounts/:id/close | accounts:write |
| POST | /journal/entries, /journal/entries/:id/reverse | journal:write |
| GET | /journal/entries/:id | accounts:read |
| POST | /payments, /payments/:id/capture, /void, /refunds | payments:write |
| GET | /payments/:id | payments:read |
| GET | /reports/trial-balance?asOf, /fx/convert | reports:read |
| PUT | /fx/rates | fx:write |
| GET | /audit | audit:read |

## Payments money flow

See the header comment in `services/paymentService.ts`. In short: authorize
moves funds wallet → holds; capture moves holds → merchant (net of fee) + fees;
void/expiry move holds → wallet; refunds move merchant → wallet.

## FX

Rates are decimal strings, `1 base = rate quote`, with an `effectiveAt`.
`FxService.convert` uses the latest rate with `effectiveAt <= at`. Only direct
pairs are supported today (LEDG-340).

## Running tests

`npm test` (or the IDE test runner). Tests use `manualClock()` starting at
2024-01-01T00:00Z — see `tests/helpers.ts`.
