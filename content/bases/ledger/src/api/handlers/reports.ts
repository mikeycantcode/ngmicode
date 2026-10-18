import { money } from "../../domain/money";
import { toIso } from "../../lib/time";
import { json } from "../http";
import type { Handler, Route } from "../router";
import { asObject, optionalIso, requireCurrency, requireString } from "../validate";
import { ValidationError } from "../../domain/errors";

const trialBalance: Handler = (c) => {
  const asOf = optionalIso(c.query, "asOf");
  const tb = c.services.reports.trialBalance(c.principal.tenantId, { asOf });
  return json(200, { ...tb, asOf: toIso(tb.asOf) });
};

const setRate: Handler = (c) => {
  const body = asObject(c.req.body);
  const r = c.services.fx.setRate(
    requireCurrency(body, "base"),
    requireCurrency(body, "quote"),
    requireString(body, "rate", 32),
    optionalIso(body, "effectiveAt"),
  );
  return json(200, { ...r, effectiveAt: toIso(r.effectiveAt) });
};

const convert: Handler = (c) => {
  const raw = c.query.amount;
  if (raw === undefined || !/^-?\d+$/.test(raw)) throw new ValidationError("amount must be an integer", { field: "amount" });
  const from = requireCurrency(c.query, "from");
  const to = requireCurrency(c.query, "to");
  const at = optionalIso(c.query, "at");
  const out = c.services.fx.convert(money(Number(raw), from), to, at);
  return json(200, { amount: out.amount, currency: out.currency });
};

const audit: Handler = (c) => {
  const events = c.services.audit.query({ tenantId: c.principal.tenantId, type: c.query.type });
  return json(200, { data: events.map((e) => ({ ...e, at: toIso(e.at) })) });
};

export const reportRoutes: Route[] = [
  { method: "GET", pattern: "/reports/trial-balance", scope: "reports:read", handler: trialBalance },
  { method: "PUT", pattern: "/fx/rates", scope: "fx:write", handler: setRate },
  { method: "GET", pattern: "/fx/convert", scope: "reports:read", handler: convert },
  { method: "GET", pattern: "/audit", scope: "audit:read", handler: audit },
];
