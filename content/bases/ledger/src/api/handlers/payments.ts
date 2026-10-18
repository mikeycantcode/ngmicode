import { json } from "../http";
import type { Handler, Route } from "../router";
import { serializePayment } from "../serializers";
import { asObject, optionalString, requireCurrency, requirePositiveInt, requireString } from "../validate";
import { idempotent, loadOwnedPayment } from "./common";

const createPayment: Handler = (c) =>
  idempotent(c, { required: true }, () => {
    const body = asObject(c.req.body);
    const payment = c.services.payments.authorize({
      tenantId: c.principal.tenantId,
      customerAccountId: requireString(body, "customerAccountId", 64),
      merchantAccountId: requireString(body, "merchantAccountId", 64),
      amount: requirePositiveInt(body, "amount"),
      currency: requireCurrency(body),
      reference: optionalString(body, "reference", 128),
    });
    return json(201, serializePayment(payment));
  });

const getPayment: Handler = (c) => json(200, serializePayment(loadOwnedPayment(c, c.params.id)));

const capturePayment: Handler = (c) => {
  const p = loadOwnedPayment(c, c.params.id);
  return json(200, serializePayment(c.services.payments.capture(p.id)));
};

const voidPayment: Handler = (c) => {
  const p = loadOwnedPayment(c, c.params.id);
  return json(200, serializePayment(c.services.payments.void(p.id)));
};

const refundPayment: Handler = (c) =>
  idempotent(c, { required: true }, () => {
    const p = loadOwnedPayment(c, c.params.id);
    const body = asObject(c.req.body);
    const updated = c.services.payments.refund(p.id, requirePositiveInt(body, "amount"));
    return json(201, serializePayment(updated));
  });

export const paymentRoutes: Route[] = [
  { method: "POST", pattern: "/payments", scope: "payments:write", handler: createPayment },
  { method: "GET", pattern: "/payments/:id", scope: "payments:read", handler: getPayment },
  { method: "POST", pattern: "/payments/:id/capture", scope: "payments:write", handler: capturePayment },
  { method: "POST", pattern: "/payments/:id/void", scope: "payments:write", handler: voidPayment },
  { method: "POST", pattern: "/payments/:id/refunds", scope: "payments:write", handler: refundPayment },
];
