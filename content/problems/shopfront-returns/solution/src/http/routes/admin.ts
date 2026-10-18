import type { ProductInput } from "../../domain/product";
import type { OrderStatus } from "../../domain/order";
import { normalizeCode, validateCouponInput, type Coupon } from "../../pricing/coupons";
import { validatePromotion, type Promotion } from "../../pricing/promotions";
import type { Services } from "../../app";
import { ConflictError, ValidationError } from "../../shared/errors";
import { requireRole, validateBody } from "../middleware";
import type { Router } from "../router";
import { json } from "../types";
import { queryInt } from "../middleware";

const ORDER_STATUSES: OrderStatus[] = ["pending", "paid", "shipped", "delivered", "returned", "cancelled"];

/** Every route in this file is admin-only. */
export function registerAdminRoutes(router: Router, s: Services) {
  const admin = requireRole("admin");

  // --- catalog ---
  router.post("/admin/products", admin, (req) => json(201, s.catalog.createProduct(req.body as ProductInput)));

  router.put("/admin/products/:id", admin, (req) => json(200, s.catalog.replaceProduct(req.params.id, req.body as ProductInput)));

  router.post("/admin/products/:id/active", admin, validateBody({ active: { type: "boolean", required: true } }), (req) =>
    json(200, s.catalog.setActive(req.params.id, (req.body as { active: boolean }).active)),
  );

  // --- inventory ---
  router.get("/admin/inventory/:sku", admin, (req) => json(200, s.inventory.level(req.params.sku)));

  router.put("/admin/inventory/:sku", admin, validateBody({ onHand: { type: "integer", required: true, min: 0 } }), (req) => {
    s.inventory.setStock(req.params.sku, (req.body as { onHand: number }).onHand);
    return json(200, s.inventory.level(req.params.sku));
  });

  router.post(
    "/admin/inventory/:sku/adjust",
    admin,
    validateBody({ delta: { type: "integer", required: true }, reason: { type: "string", required: true, min: 3 } }),
    (req) => {
      const b = req.body as { delta: number; reason: string };
      return json(200, s.inventory.adjust(req.params.sku, b.delta, b.reason));
    },
  );

  // --- orders ---
  router.get("/admin/orders", admin, (req) => {
    const status = req.query.status as OrderStatus | undefined;
    if (status && !ORDER_STATUSES.includes(status)) throw new ValidationError(`unknown status ${status}`);
    return json(200, s.orders.list({ status, page: queryInt(req.query, "page"), pageSize: queryInt(req.query, "pageSize") }));
  });

  router.post("/admin/orders/:id/ship", admin, validateBody({ trackingNumber: { type: "string", required: true, min: 4 } }), (req) =>
    json(200, s.orders.ship(req.params.id, (req.body as { trackingNumber: string }).trackingNumber)),
  );

  router.post("/admin/orders/:id/deliver", admin, (req) => json(200, s.orders.deliver(req.params.id)));

  // --- pricing ---
  router.post("/admin/coupons", admin, (req) => {
    const b = req.body as Partial<Coupon>;
    const errors = validateCouponInput(b);
    if (errors.length) throw new ValidationError("invalid coupon", errors);
    const code = normalizeCode(b.code!);
    if (s.repos.coupons.has(code)) throw new ConflictError(`coupon ${code} exists`);
    const coupon: Coupon = {
      id: code,
      code,
      kind: b.kind!,
      value: b.value!,
      minSubtotalCents: b.minSubtotalCents ?? 0,
      expiresAt: b.expiresAt ?? null,
      maxRedemptions: b.maxRedemptions ?? null,
      redemptions: 0,
    };
    s.repos.coupons.save(coupon);
    return json(201, coupon);
  });

  router.post("/admin/promotions", admin, (req) => {
    const p = req.body as Promotion;
    const errors = validatePromotion(p);
    if (errors.length) throw new ValidationError("invalid promotion", errors);
    if (s.repos.promotions.has(p.id)) throw new ConflictError(`promotion ${p.id} exists`);
    s.repos.promotions.save(p);
    return json(201, p);
  });

  // --- maintenance (cron hits this every minute) ---
  router.post("/admin/maintenance/expire", admin, () => {
    const orders = s.orders.expirePending();
    const reservations = s.inventory.expireStale();
    return json(200, { cancelledOrders: orders, releasedReservations: reservations });
  });
}
