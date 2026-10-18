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
  | (PromotionBase & { kind: "volume_tier"; tiers: VolumeTier[] })
  | (PromotionBase & { kind: "buy_x_get_y"; category: string; buy: number; get: number });

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
    case "buy_x_get_y":
      if (typeof p.category !== "string" || !p.category) errors.push("category is required");
      if (!Number.isInteger(p.buy) || p.buy < 1) errors.push("buy must be a positive integer");
      if (!Number.isInteger(p.get) || p.get < 1) errors.push("get must be a positive integer");
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

/**
 * Buy X get Y free: units of every product in the category are pooled across lines.
 * For each complete group of (buy + get) units, the `get` cheapest units in the
 * pool are free (ties: earlier cart line first). Runs before all other promotions,
 * so free units are valued at list price.
 */
export function buyXGetYRule(p: Extract<Promotion, { kind: "buy_x_get_y" }>): PricingRule {
  const label = p.label ?? `Buy ${p.buy} get ${p.get} free (${p.category})`;
  return {
    id: p.id,
    label,
    stage: "item",
    priority: PRIORITY.BUY_X_GET_Y,
    apply(state) {
      const eligible = state.lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.category === p.category);
      const units = eligible.reduce((n, e) => n + e.line.quantity, 0);
      let free = Math.floor(units / (p.buy + p.get)) * p.get;
      if (free === 0) return;
      const cheapestFirst = [...eligible].sort((a, b) => a.line.unitPriceCents - b.line.unitPriceCents || a.index - b.index);
      for (const { line } of cheapestFirst) {
        if (free === 0) break;
        const n = Math.min(free, line.quantity);
        free -= n;
        discountLine(state, line, n * line.unitPriceCents, { id: p.id, label });
      }
    },
  };
}

export function ruleForPromotion(p: Promotion): PricingRule {
  switch (p.kind) {
    case "buy_x_get_y":
      return buyXGetYRule(p);
    case "category_percent":
      return categoryPercentRule(p);
    case "volume_tier":
      return volumeTierRule(p.id, p.tiers, p.label);
  }
}
