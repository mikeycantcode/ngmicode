import { MAX_LINE_QUANTITY } from "../../config";
import type { Services } from "../../app";
import { SHIPPING_METHODS, isShippingMethod, type ShippingMethod } from "../../shipping/rates";
import { AppError, ValidationError } from "../../shared/errors";
import { requireAuth, validateBody } from "../middleware";
import type { Router } from "../router";
import { json } from "../types";

export function registerCartRoutes(router: Router, s: Services) {
  const regionOf = (customerId: string, override?: string) => override || s.repos.customers.require(customerId).region;

  router.get("/cart", requireAuth, (req) => json(200, s.carts.getOrCreate(req.user!.id)));

  router.post(
    "/cart/items",
    requireAuth,
    validateBody({ sku: { type: "string", required: true }, quantity: { type: "integer", required: true, min: 1, max: MAX_LINE_QUANTITY } }),
    (req) => {
      const b = req.body as { sku: string; quantity: number };
      return json(200, s.carts.addItem(req.user!.id, b.sku, b.quantity));
    },
  );

  router.patch(
    "/cart/items/:sku",
    requireAuth,
    validateBody({ quantity: { type: "integer", required: true, min: 0, max: MAX_LINE_QUANTITY } }),
    (req) => json(200, s.carts.setQuantity(req.user!.id, req.params.sku, (req.body as { quantity: number }).quantity)),
  );

  router.delete("/cart/items/:sku", requireAuth, (req) => json(200, s.carts.removeItem(req.user!.id, req.params.sku)));

  router.post("/cart/coupon", requireAuth, validateBody({ code: { type: "string", required: true } }), (req) =>
    json(200, s.carts.applyCoupon(req.user!.id, (req.body as { code: string }).code)),
  );

  router.delete("/cart/coupon", requireAuth, (req) => json(200, s.carts.removeCoupon(req.user!.id)));

  // GET /cart/quote?method=standard&region=US-NY
  router.get("/cart/quote", requireAuth, (req) => {
    const method = (req.query.method || "standard") as ShippingMethod;
    if (!isShippingMethod(method)) throw new ValidationError(`unknown shipping method ${method}`);
    const quote = s.carts.quote(req.user!.id, { region: regionOf(req.user!.id, req.query.region), shippingMethod: method });
    return json(200, quote);
  });

  // Price of every shipping method for the current cart; unavailable methods are omitted.
  router.get("/cart/shipping-estimates", requireAuth, (req) => {
    const region = regionOf(req.user!.id, req.query.region);
    const estimates: Array<{ method: ShippingMethod; shippingCents: number; totalCents: number }> = [];
    for (const method of SHIPPING_METHODS) {
      try {
        const q = s.carts.quote(req.user!.id, { region, shippingMethod: method });
        estimates.push({ method, shippingCents: q.shippingCents, totalCents: q.totalCents });
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        if (e instanceof ValidationError && /not available/.test(e.message)) continue;
        throw e;
      }
    }
    return json(200, { region, estimates });
  });
}
