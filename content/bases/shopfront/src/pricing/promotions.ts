import { percentOf } from "../shared/money";
import { discountLine, lineNet, PRIORITY, type PricingRule } from "./rules";
import { volumeTierRule, type VolumeTier } from "./tiers";

interface PromotionBase {
  id: string;
  label?: string;
  /** Inclusive start (epoch ms). Omitted = always started. */
  startsAt?: number;
  /** Exclusive end (epoch ms). Omitted = never ends. */
  endsAt?: number;
}

export type Promotion =
  | (PromotionBase & { kind: "category_percent"; category: string; percent: number })
  | (PromotionBase & { kind: "volume_tier"; tiers: VolumeTier[] });

export function validatePromotion(p: Promotion): string[] {
  const errors: string[] = [];
  if (!p || typeof p.id !== "string" || !p.id) errors.push("id is required");
  if (p.startsAt !== undefined && p.endsAt !== undefined && p.endsAt <= p.startsAt) errors.push("endsAt must be after startsAt");
  switch (p.kind) {
    case "category_percent":
      if (!p.category) errors.push("category is required");
      if (!(p.percent > 0 && p.percent <= 100)) errors.push("percent must be in (0, 100]");
      break;
    case "volume_tier":
      if (!Array.isArray(p.tiers) || p.tiers.length === 0) errors.push("tiers are required");
      break;
    default:
      errors.push(`unknown promotion kind ${(p as { kind: string }).kind}`);
  }
  return errors;
}

export function categoryPercentRule(p: Extract<Promotion, { kind: "category_percent" }>): PricingRule {
  const label = p.label ?? `${p.percent}% off ${p.category}`;
  return {
    id: p.id,
    label,
    stage: "item",
    priority: PRIORITY.PROMOTION,
    apply(state) {
      for (const line of state.lines) {
        if (line.category !== p.category) continue;
        discountLine(state, line, percentOf(lineNet(line), p.percent), { id: p.id, label });
      }
    },
  };
}

export function ruleForPromotion(p: Promotion): PricingRule {
  switch (p.kind) {
    case "category_percent":
      return categoryPercentRule(p);
    case "volume_tier":
      return volumeTierRule(p.id, p.tiers, p.label);
  }
}
