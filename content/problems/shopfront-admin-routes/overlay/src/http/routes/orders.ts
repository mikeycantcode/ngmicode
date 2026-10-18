import type { Services } from "../../app";
import { SHIPPING_METHODS } from "../../shipping/rates";
import { NotFoundError } from "../../shared/errors";
import type { Order } from "../../domain/order";
import type { AuthUser } from "../types";
import { requireAuth, validateBody } from "../middleware";
import type { Router } from "../router";
import { json } from "../types";

/** Loads an order for display; 404 when it doesn't exist. */
export function loadVisibleOrder(s: Services, user: AuthUser, orderId: string): Order {
  const order = s.orders.get(orderId);
  if (!order) throw new NotFoundError(`order ${orderId} not found`);
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

  router.post("/orders/:id/pay", requireAuth, validateBody({ paymentToken: { type: "string", required: true } }), (req) => {
    const order = loadVisibleOrder(s, req.user!, req.params.id);
    if (order.customerId !== req.user!.id) throw new NotFoundError(`order ${order.id} not found`);
    return json(200, s.orders.pay(order.id, (req.body as { paymentToken: string }).paymentToken));
  });
}
