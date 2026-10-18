import type { Account } from "../../domain/account";
import { NotFoundError, ValidationError } from "../../domain/errors";
import type { JournalEntry } from "../../domain/journal";
import type { Payment } from "../../domain/payment";
import { ApiResponse, header } from "../http";
import type { HandlerContext } from "../router";

// Tenant isolation helpers. Resources owned by another tenant are reported as
// NOT FOUND (never 403) so ids can't be probed across tenants.

export function loadOwnedAccount(c: HandlerContext, id: string): Account {
  const acct = c.services.accounts.get(id);
  if (acct.tenantId !== c.principal.tenantId) throw new NotFoundError("account", id);
  return acct;
}

export function loadOwnedEntry(c: HandlerContext, id: string): JournalEntry {
  const entry = c.services.journal.get(id);
  if (entry.tenantId !== c.principal.tenantId) throw new NotFoundError("journal entry", id);
  return entry;
}

export function loadOwnedPayment(c: HandlerContext, id: string): Payment {
  const p = c.services.payments.get(id);
  if (p.tenantId !== c.principal.tenantId) throw new NotFoundError("payment", id);
  return p;
}

/**
 * Wraps an unsafe handler with Idempotency-Key semantics (see
 * services/idempotency.ts). Keys are scoped per endpoint so clients can reuse
 * their order id as the key for both the payment and its refunds.
 * Replays are marked with an `idempotent-replayed: true` header.
 */
export function idempotent(c: HandlerContext, opts: { required: boolean }, fn: () => ApiResponse): ApiResponse {
  const key = header(c.req, "idempotency-key");
  if (key === undefined || key === "") {
    if (opts.required) throw new ValidationError("Idempotency-Key header is required", { field: "Idempotency-Key" });
    return fn();
  }
  if (key.length > 255) throw new ValidationError("Idempotency-Key must be at most 255 characters", { field: "Idempotency-Key" });
  const request = { method: c.req.method, path: c.req.path.split("?")[0], body: c.req.body ?? null };
  const r = c.services.idempotency.run(request.path, key, request, fn);
  if (!r.replayed) return r.value;
  return { ...r.value, headers: { ...(r.value.headers ?? {}), "idempotent-replayed": "true" } };
}
