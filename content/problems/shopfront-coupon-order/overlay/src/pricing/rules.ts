// Pricing rule plumbing shared by promotions, volume tiers and coupons.

export interface PricingLine {
  sku: string;
  productId: string;
  name: string;
  category: string;
  tags: string[];
  unitPriceCents: number;
  quantity: number;
  /** unitPriceCents * quantity — never changes during pricing. */
  subtotalCents: number;
  /** Accumulated item-level discount. Rules add to it; never exceeds subtotalCents. */
  discountCents: number;
}

export interface Adjustment {
  ruleId: string;
  label: string;
  /** Positive number = money off. */
  amountCents: number;
  /** Set for item-level adjustments. */
  sku?: string;
}

export interface PricingState {
  lines: PricingLine[];
  orderDiscountCents: number;
  adjustments: Adjustment[];
}

export interface PricingContext {
  now: number;
  region: string;
  customerId?: string;
}

export type RuleStage = "item" | "order";

export interface PricingRule {
  id: string;
  label: string;
  stage: RuleStage;
  /** Lower runs first. Convention: promotions 10, volume tiers 20, coupons 30. */
  priority: number;
  apply(state: PricingState, ctx: PricingContext): void;
}

export const PRIORITY = {
  PROMOTION: 10,
  VOLUME_TIER: 20,
  COUPON: 30,
} as const;

/**
 * Sort comparator for rules: highest priority first.
 * (Shared so the engine and the admin "pricing preview" list rules the same way.)
 */
export function byPriority(a: PricingRule, b: PricingRule): number {
  return b.priority - a.priority;
}

export function lineNet(line: PricingLine): number {
  return line.subtotalCents - line.discountCents;
}

/** Goods value after every discount applied so far (item + order level). */
export function goodsNet(state: PricingState): number {
  let total = 0;
  for (const l of state.lines) total += lineNet(l);
  return total - state.orderDiscountCents;
}

/** Adds an item-level discount, capped so a line can never go negative. */
export function discountLine(state: PricingState, line: PricingLine, amount: number, rule: { id: string; label: string }): number {
  const applied = Math.max(0, Math.min(amount, lineNet(line)));
  if (applied === 0) return 0;
  line.discountCents += applied;
  state.adjustments.push({ ruleId: rule.id, label: rule.label, amountCents: applied, sku: line.sku });
  return applied;
}

/** Adds an order-level discount, capped at the remaining goods value. */
export function discountOrder(state: PricingState, amount: number, rule: { id: string; label: string }): number {
  const applied = Math.max(0, Math.min(amount, goodsNet(state)));
  if (applied === 0) return 0;
  state.orderDiscountCents += applied;
  state.adjustments.push({ ruleId: rule.id, label: rule.label, amountCents: applied });
  return applied;
}
