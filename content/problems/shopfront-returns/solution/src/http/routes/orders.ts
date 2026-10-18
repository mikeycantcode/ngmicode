import type { Services } from "../../app";
import { SHIPPING_METHODS } from "../../shipping/rates";
import { NotFoundError } from "../../shared/errors";
import type { Order } from "../../domain/order";
import type { AuthUser } from "../types";
import { requireAuth, validateBody } from "../middleware";
import type { Router } from "../router";
import { json } from "../types";

/**
 * Customers may only see their own orders. We answer 404 (not 403) for other
 * people's orders so order ids can't be probed for existence.
 */
export function loadVisibleOrder(s: Services, user: AuthUser, orderId: string): Order {
  const order = s.orders.get(orderId);
  if (!order || (user.role !== "admin" && order.customerId !== user.id)) throw new NotFoundError(`order ${orderId} not found`);
  return order;
}

export function registerOrderRoutes(router: Router, s: Services) {
  router.post(
    "/checkout",
    requireAuth,
    validateBody({ shippingMethod: { type: "string", required: true, enum: SHIPPING_METHODS }, region: { type: "string" } }),
    (req) => {
      const b = req.body as { shippingMethod: (typeof SHIPPING_METHODS)[number]; region?: string };
      const order = s.checkout.checkout(req.user!.id, { shippingMethod: b.shippingMethod, region: b.region });
      return json(201, order);
    },
  );

  router.get("/orders/:id", requireAuth, (req) => json(200, loadVisibleOrder(s, req.user!, req.params.id)));

  router.post("/orders/:id/returns", requireAuth, validateBody({ lines: { type: "array", required: true, min: 1 } }), (req) => {
    const order = loadVisibleOrder(s, req.user!, req.params.id);
    const result = s.orders.returnItems(order.id, (req.body as { lines: Array<{ sku: string; quantity: number }> }).lines);
    return json(201, result);
  });

  router.post("/orders/:id/pay", requireAuth, validateBody({ paymentToken: { type: "string", required: true } }), (req) => {
    const order = loadVisibleOrder(s, req.user!, req.params.id);
    if (order.customerId !== req.user!.id) throw new NotFoundError(`order ${order.id} not found`);
    return json(200, s.orders.pay(order.id, (req.body as { paymentToken: string }).paymentToken));
  });
}
