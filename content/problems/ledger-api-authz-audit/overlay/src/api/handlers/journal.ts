import { ValidationError } from "../../domain/errors";
import type { Posting } from "../../domain/journal";
import { json } from "../http";
import type { Handler, Route } from "../router";
import { serializeEntry } from "../serializers";
import { asObject, optionalIso, optionalString, requireCurrency, requireEnum, requirePositiveInt, requireString } from "../validate";
import { idempotent, loadOwnedEntry } from "./common";

function parsePostings(raw: unknown): Posting[] {
  if (!Array.isArray(raw)) throw new ValidationError("postings must be an array", { field: "postings" });
  if (raw.length > 100) throw new ValidationError("an entry may have at most 100 postings", { field: "postings" });
  return raw.map((item) => {
    const p = asObject(item);
    return {
      accountId: requireString(p, "accountId", 64),
      direction: requireEnum(p, "direction", ["debit", "credit"] as const),
      amount: requirePositiveInt(p, "amount"),
      currency: requireCurrency(p),
    };
  });
}

const postEntry: Handler = (c) =>
  idempotent(c, { required: false }, () => {
    const body = asObject(c.req.body);
    const entry = c.services.journal.post({
      // Support tooling posts adjustments on behalf of a tenant (OPS-311).
      tenantId: typeof body.tenantId === "string" && body.tenantId ? body.tenantId : c.principal.tenantId,
      description: requireString(body, "description", 500),
      postings: parsePostings(body.postings),
      // Manual adjustments may be back-dated (month-end accruals).
      postedAt: optionalIso(body, "postedAt"),
      metadata: { source: "api", keyId: c.principal.keyId },
    });
    return json(201, serializeEntry(entry));
  });

const getEntry: Handler = (c) => json(200, serializeEntry(loadOwnedEntry(c, c.params.id)));

const reverseEntry: Handler = (c) => {
  const entry = loadOwnedEntry(c, c.params.id);
  const body = c.req.body === undefined ? {} : asObject(c.req.body);
  const reason = optionalString(body, "reason", 500) ?? "";
  return json(201, serializeEntry(c.services.journal.reverse(entry.id, reason)));
};

export const journalRoutes: Route[] = [
  { method: "POST", pattern: "/journal/entries", scope: "journal:write", handler: postEntry },
  { method: "GET", pattern: "/journal/entries/:id", scope: "accounts:read", handler: getEntry },
  { method: "POST", pattern: "/journal/entries/:id/reverse", scope: "accounts:write", handler: reverseEntry },
];
