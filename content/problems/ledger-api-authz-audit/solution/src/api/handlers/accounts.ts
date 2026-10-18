import { ACCOUNT_TYPES } from "../../domain/account";
import { toIso } from "../../lib/time";
import { json } from "../http";
import type { Handler, Route } from "../router";
import { serializeAccount, serializeEntry, serializeStatement } from "../serializers";
import {
  asObject,
  optionalBoolean,
  optionalIso,
  optionalString,
  requireCurrency,
  requireEnum,
  requireIso,
  requireString,
} from "../validate";
import { loadOwnedAccount } from "./common";

const createAccount: Handler = (c) => {
  const body = asObject(c.req.body);
  const account = c.services.accounts.open({
    tenantId: c.principal.tenantId,
    name: requireString(body, "name"),
    type: requireEnum(body, "type", ACCOUNT_TYPES),
    currency: requireCurrency(body),
    code: optionalString(body, "code", 64),
    allowNegative: optionalBoolean(body, "allowNegative"),
  });
  return json(201, serializeAccount(account));
};

const listAccounts: Handler = (c) => {
  return json(200, { data: c.services.accounts.list(c.principal.tenantId).map(serializeAccount) });
};

const getAccount: Handler = (c) => json(200, serializeAccount(loadOwnedAccount(c, c.params.id)));

const getBalance: Handler = (c) => {
  const acct = loadOwnedAccount(c, c.params.id);
  const asOf = optionalIso(c.query, "asOf");
  const bal = c.services.balances.getBalance(acct.id, { asOf });
  return json(200, {
    accountId: acct.id,
    amount: bal.amount,
    currency: bal.currency,
    asOf: asOf !== undefined ? toIso(asOf) : null,
  });
};

const getStatement: Handler = (c) => {
  const acct = loadOwnedAccount(c, c.params.id);
  const from = requireIso(c.query, "from");
  const to = requireIso(c.query, "to");
  return json(200, serializeStatement(c.services.statements.getStatement(acct.id, { from, to })));
};

// TODO(LEDG-298): paginate before the partner launch — busy wallets have 50k+ entries.
const listEntries: Handler = (c) => {
  const acct = loadOwnedAccount(c, c.params.id);
  const entries = c.services.repos.journal.listForAccount(acct.id);
  return json(200, { data: entries.map(serializeEntry) });
};

const closeAccount: Handler = (c) => {
  const acct = loadOwnedAccount(c, c.params.id);
  return json(200, serializeAccount(c.services.accounts.close(acct.id)));
};

export const accountRoutes: Route[] = [
  { method: "POST", pattern: "/accounts", scope: "accounts:write", handler: createAccount },
  { method: "GET", pattern: "/accounts", scope: "accounts:read", handler: listAccounts },
  { method: "GET", pattern: "/accounts/:id", scope: "accounts:read", handler: getAccount },
  { method: "GET", pattern: "/accounts/:id/balance", scope: "accounts:read", handler: getBalance },
  { method: "GET", pattern: "/accounts/:id/statement", scope: "accounts:read", handler: getStatement },
  { method: "GET", pattern: "/accounts/:id/entries", scope: "accounts:read", handler: listEntries },
  { method: "POST", pattern: "/accounts/:id/close", scope: "accounts:write", handler: closeAccount },
];
