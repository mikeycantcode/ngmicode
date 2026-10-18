import { discountLine, lineNet, PRIORITY, type PricingLine, type PricingRule } from "./rules";

export interface VolumeTier {
  /** Minimum quantity (inclusive) for this tier to apply. */
  minQty: number;
  /** Percent off, integer 1-50. */
  percent: number;
}

export const NO_VOLUME_DISCOUNT_TAG = "no-volume-discount";

/**
 * Volume ("buy more, save more") discount, v2.
 *
 * Quantity is summed per product across all its (non-excluded) lines; the tier with
 * the highest minQty <= that total applies to every line of the product. The discount
 * is floor(lineNet * percent / 100) on the line's current net.
 */
export function volumeTierRule(id: string, tiers: VolumeTier[], label = "Volume discount"): PricingRule {
  validateTiers(tiers);
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  const excluded = (l: PricingLine) => l.tags.includes(NO_VOLUME_DISCOUNT_TAG);
  return {
    id,
    label,
    stage: "item",
    priority: PRIORITY.VOLUME_TIER,
    apply(state) {
      const qtyByProduct = new Map<string, number>();
      for (const line of state.lines) {
        if (excluded(line)) continue;
        qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.quantity);
      }
      for (const line of state.lines) {
        if (excluded(line)) continue;
        const total = qtyByProduct.get(line.productId) ?? 0;
        const tier = sorted.find((t) => total >= t.minQty);
        if (!tier) continue;
        const amount = Math.floor((lineNet(line) * tier.percent) / 100);
        discountLine(state, line, amount, { id, label: `${label} (${tier.percent}% off)` });
      }
    },
  };
}

function validateTiers(tiers: VolumeTier[]): void {
  if (!Array.isArray(tiers) || tiers.length === 0) throw new RangeError("volume tiers must not be empty");
  const seen = new Set<number>();
  for (const t of tiers) {
    if (!Number.isInteger(t.minQty) || t.minQty < 2) throw new RangeError(`invalid tier minQty: ${t.minQty}`);
    if (!Number.isInteger(t.percent) || t.percent < 1 || t.percent > 50) throw new RangeError(`invalid tier percent: ${t.percent}`);
    if (seen.has(t.minQty)) throw new RangeError(`duplicate tier minQty: ${t.minQty}`);
    seen.add(t.minQty);
  }
}
