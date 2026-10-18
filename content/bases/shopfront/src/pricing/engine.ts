import type { CartLine } from "../cart/cart-service";
import { ValidationError } from "../shared/errors";
import type { Clock } from "../shared/clock";
import type { ProductRepository } from "../repo/products";
import type { CouponRepository, PromotionRepository } from "../repo/pricing";
import { quoteShipping, type ShippingMethod } from "../shipping/rates";
import { checkCouponUsable, couponRule, normalizeCode } from "./coupons";
import { ruleForPromotion } from "./promotions";
import { goodsNet, type Adjustment, type PricingLine, type PricingRule, type PricingState } from "./rules";
import { taxFor } from "./tax";

export interface QuoteRequest {
  lines: CartLine[];
  region: string;
  shippingMethod: ShippingMethod;
  couponCode?: string | null;
  customerId?: string;
}

export interface QuoteLine {
  sku: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: number;
  itemDiscountCents: number;
  orderDiscountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  weightGrams: number;
  couponCode: string | null;
  adjustments: Adjustment[];
}

interface Deps {
  clock: Clock;
  products: ProductRepository;
  coupons: CouponRepository;
  promotions: PromotionRepository;
}

/**
 * Prices a set of cart lines.
 *
 * Order of operations (this is the contract finance signed off on):
 *   1. Item-level rules, ascending priority: category promotions (10), then
 *      volume tiers (20). Each rule discounts the line's CURRENT net, so
 *      discounts compound rather than both applying to list price.
 *   2. Order-level rules: coupons (30), applied to the goods net left after
 *      step 1. At most one coupon per order.
 *   3. Shipping, using the final goods net for free-shipping thresholds.
 *   4. Tax on the final goods net (shipping is not taxed).
 * Every rounding step rounds half-up to whole cents.
 */
export class PricingEngine {
  constructor(private deps: Deps) {}

  quote(req: QuoteRequest): Quote {
    if (req.lines.length === 0) throw new ValidationError("cannot price an empty cart");
    const now = this.deps.clock.now();
    let weightGrams = 0;

    const lines: PricingLine[] = req.lines.map((cl) => {
      const found = this.deps.products.findBySku(cl.sku);
      if (!found) throw new ValidationError(`unknown sku ${cl.sku}`);
      const { product, variant } = found;
      if (!product.active) throw new ValidationError(`${product.name} is no longer available`);
      weightGrams += variant.weightGrams * cl.quantity;
      return {
        sku: variant.sku,
        productId: product.id,
        name: `${product.name} — ${variant.name}`,
        category: product.category,
        tags: product.tags,
        unitPriceCents: variant.priceCents,
        quantity: cl.quantity,
        subtotalCents: variant.priceCents * cl.quantity,
        discountCents: 0,
      };
    });

    const rules = this.rulesFor(req, now);
    const state: PricingState = { lines, orderDiscountCents: 0, adjustments: [] };
    for (const rule of rules) rule.apply(state, { now, region: req.region, customerId: req.customerId });

    const net = goodsNet(state);
    const shippingCents = quoteShipping({ method: req.shippingMethod, region: req.region, weightGrams, goodsNetCents: net });
    const taxCents = taxFor(req.region, net);
    const subtotalCents = lines.reduce((n, l) => n + l.subtotalCents, 0);
    const itemDiscountCents = lines.reduce((n, l) => n + l.discountCents, 0);

    return {
      lines: lines.map((l) => ({
        sku: l.sku,
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        subtotalCents: l.subtotalCents,
        discountCents: l.discountCents,
        totalCents: l.subtotalCents - l.discountCents,
      })),
      subtotalCents,
      itemDiscountCents,
      orderDiscountCents: state.orderDiscountCents,
      shippingCents,
      taxCents,
      totalCents: net + shippingCents + taxCents,
      weightGrams,
      couponCode: req.couponCode ? normalizeCode(req.couponCode) : null,
      adjustments: state.adjustments,
    };
  }

  private rulesFor(req: QuoteRequest, now: number): PricingRule[] {
    const rules = this.deps.promotions.activeAt(now).map(ruleForPromotion);
    if (req.couponCode) {
      const coupon = this.deps.coupons.findByCode(req.couponCode);
      if (!coupon) throw new ValidationError(`unknown coupon ${normalizeCode(req.couponCode)}`);
      const usable = checkCouponUsable(coupon, now);
      if (!usable.ok) throw new ValidationError(usable.error);
      rules.push(couponRule(coupon));
    }
    // stable sort: equal priorities keep insertion order
    return rules.sort((a, b) => a.priority - b.priority);
  }
}
