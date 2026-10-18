import { toIso } from "../../lib/time";
import { json } from "../http";
import type { Handler, Route } from "../router";
import { asObject, requireIso } from "../validate";

const serialize = (through: number | null) => ({ closedThrough: through === null ? null : toIso(through) });

const closePeriod: Handler = (c) => {
  const body = asObject(c.req.body);
  const through = c.services.periods.close(c.principal.tenantId, requireIso(body, "through"));
  return json(200, serialize(through));
};

const getPeriods: Handler = (c) => json(200, serialize(c.services.periods.closedThrough(c.principal.tenantId)));

export const periodRoutes: Route[] = [
  { method: "POST", pattern: "/periods/close", scope: "periods:write", handler: closePeriod },
  { method: "GET", pattern: "/periods", scope: "reports:read", handler: getPeriods },
];
