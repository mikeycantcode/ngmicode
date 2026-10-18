import { formatCents, percentOf } from "../shared/money";
import { err, ok, type Result } from "../shared/errors";
import { ValidationError } from "../shared/errors";
import { discountOrder, goodsNet, PRIORITY, type PricingRule } from "./rules";

export interface Coupon {
  /** Same as code — coupons are stored keyed by their upper-cased code. */
  id: string;
  code: string;
  kind: "percent" | "fixed";
  /** percent (1-100) for "percent", cents for "fixed". */
  value: number;
  /** Goods net (after item-level discounts) required to use the coupon. */
  minSubtotalCents: number;
  expiresAt: number | null;
  maxRedemptions: number | null;
  redemptions: number;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Checks that do not depend on the cart contents. */
export function checkCouponUsable(coupon: Coupon, now: number): Result<Coupon, string> {
  if (coupon.expiresAt !== null && now >= coupon.expiresAt) return err(`coupon ${coupon.code} has expired`);
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) {
    return err(`coupon ${coupon.code} has been fully redeemed`);
  }
  return ok(coupon);
}

export function validateCouponInput(c: Partial<Coupon>): string[] {
  const errors: string[] = [];
  if (typeof c.code !== "string" || !/^[A-Za-z0-9]{3,20}$/.test(c.code)) errors.push("code must be 3-20 alphanumerics");
  if (c.kind !== "percent" && c.kind !== "fixed") errors.push("kind must be percent or fixed");
  if (!Number.isInteger(c.value) || (c.value as number) <= 0) errors.push("value must be a positive integer");
  if (c.kind === "percent" && (c.value as number) > 100) errors.push("percent coupons cannot exceed 100");
  return errors;
}

/**
 * Order-level coupon. Runs after all item-level rules, so a percent coupon is
 * taken off the already-discounted goods total, never the list price.
 */
export function couponRule(coupon: Coupon): PricingRule {
  const label = coupon.kind === "percent" ? `Coupon ${coupon.code} (${coupon.value}% off)` : `Coupon ${coupon.code} (${formatCents(coupon.value)} off)`;
  return {
    id: `coupon:${coupon.code}`,
    label,
    stage: "order",
    priority: PRIORITY.COUPON,
    apply(state) {
      const base = goodsNet(state);
      if (base < coupon.minSubtotalCents) {
        throw new ValidationError(`coupon ${coupon.code} requires a subtotal of at least ${formatCents(coupon.minSubtotalCents)}`);
      }
      const amount = coupon.kind === "percent" ? percentOf(base, coupon.value) : coupon.value;
      discountOrder(state, amount, { id: `coupon:${coupon.code}`, label });
    },
  };
}
