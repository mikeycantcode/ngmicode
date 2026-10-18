import { percentOf } from "../shared/money";
import { discountLine, lineNet, PRIORITY, type PricingRule } from "./rules";

export interface VolumeTier {
  /** Minimum quantity (inclusive) for this tier to apply. */
  minQty: number;
  /** Percent off, e.g. 10 for 10%. */
  percent: number;
}

/**
 * Volume ("buy more, save more") discount.
 *
 * For each cart line, picks the tier with the highest minQty <= line.quantity
 * and takes that percent off the line's current net (after earlier promotions).
 */
export function volumeTierRule(id: string, tiers: VolumeTier[], label = "Volume discount"): PricingRule {
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  return {
    id,
    label,
    stage: "item",
    priority: PRIORITY.VOLUME_TIER,
    apply(state) {
      for (const line of state.lines) {
        const tier = sorted.find((t) => line.quantity >= t.minQty);
        if (!tier) continue;
        discountLine(state, line, percentOf(lineNet(line), tier.percent), { id, label });
      }
    },
  };
}
