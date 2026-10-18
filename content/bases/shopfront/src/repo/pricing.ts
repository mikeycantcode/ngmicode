import type { Coupon } from "../pricing/coupons";
import type { Promotion } from "../pricing/promotions";
import { InMemoryRepository } from "./memory";

/** Coupons are keyed by their (upper-cased) code: coupon.id === coupon.code. */
export class CouponRepository extends InMemoryRepository<Coupon> {
  constructor() {
    super("coupon");
  }

  findByCode(code: string): Coupon | undefined {
    return this.get(code.trim().toUpperCase());
  }
}

export class PromotionRepository extends InMemoryRepository<Promotion> {
  constructor() {
    super("promotion");
  }

  activeAt(now: number): Promotion[] {
    return this.find((p) => (p.startsAt ?? -Infinity) <= now && now < (p.endsAt ?? Infinity));
  }
}
