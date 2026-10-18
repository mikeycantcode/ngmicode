import type { Clock } from "../shared/clock";
import { ConflictError, NotFoundError, ValidationError } from "../shared/errors";
import { applyBps, type Bps, type Cents } from "../shared/money";

export type Promo =
  | { code: string; kind: "percent"; percentBps: Bps; maxDiscountCents: Cents | null; expiresAt: number | null; maxRedemptions: number | null }
  | { code: string; kind: "flat"; amountCents: Cents; expiresAt: number | null; maxRedemptions: number | null };

/** Discount for a ride portion of `rideCents`. Never exceeds the ride portion. */
export function computeDiscount(promo: Promo, rideCents: Cents): Cents {
  let d: Cents;
  if (promo.kind === "percent") {
    d = applyBps(rideCents, promo.percentBps);
    if (promo.maxDiscountCents !== null) d = Math.min(d, promo.maxDiscountCents);
  } else {
    d = promo.amountCents;
  }
  return Math.max(0, Math.min(d, rideCents));
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Promo catalog + redemption tracking. Each rider may redeem a given code
 * once. Redemption happens on trip completion, not on request.
 */
export class PromoService {
  private readonly promos = new Map<string, Promo>();
  private readonly redemptions = new Map<string, Set<string>>(); // code -> riderIds

  constructor(private readonly deps: { clock: Clock }) {}

  create(promo: Promo): Promo {
    const code = normalizeCode(promo.code);
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new ValidationError("promo code must be 3-20 alphanumerics");
    if (this.promos.has(code)) throw new ConflictError("promo_exists", `promo ${code} exists`);
    if (promo.kind === "percent" && (promo.percentBps <= 0 || promo.percentBps > 10_000)) {
      throw new ValidationError("percentBps must be in (0, 10000]");
    }
    if (promo.kind === "flat" && (!Number.isInteger(promo.amountCents) || promo.amountCents <= 0)) {
      throw new ValidationError("amountCents must be a positive integer");
    }
    const stored = { ...promo, code } as Promo;
    this.promos.set(code, stored);
    this.redemptions.set(code, new Set());
    return stored;
  }

  get(code: string): Promo {
    const p = this.promos.get(normalizeCode(code));
    if (!p) throw new NotFoundError("promo", code);
    return p;
  }

  /** Throws if `riderId` can't use `code` right now. */
  validate(code: string, riderId: string): Promo {
    const promo = this.get(code);
    const now = this.deps.clock.now();
    if (promo.expiresAt !== null && now >= promo.expiresAt) {
      throw new ConflictError("promo_expired", `promo ${promo.code} has expired`);
    }
    const used = this.redemptions.get(promo.code)!;
    if (used.has(riderId)) throw new ConflictError("promo_already_used", `promo ${promo.code} already used`);
    if (promo.maxRedemptions !== null && used.size >= promo.maxRedemptions) {
      throw new ConflictError("promo_exhausted", `promo ${promo.code} is fully redeemed`);
    }
    return promo;
  }

  redeem(code: string, riderId: string): void {
    const promo = this.get(code);
    this.redemptions.get(promo.code)!.add(riderId);
  }

  redemptionCount(code: string): number {
    return this.redemptions.get(normalizeCode(code))?.size ?? 0;
  }
}
