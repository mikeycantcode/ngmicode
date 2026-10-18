import { MAX_LINE_QUANTITY } from "../config";
import type { Clock } from "../shared/clock";
import { NotFoundError, ValidationError } from "../shared/errors";
import type { IdGenerator } from "../shared/ids";
import type { CartRepository } from "../repo/stores";
import type { CouponRepository } from "../repo/pricing";
import type { ProductRepository } from "../repo/products";
import { checkCouponUsable, normalizeCode } from "../pricing/coupons";
import type { PricingEngine, Quote } from "../pricing/engine";
import type { ShippingMethod } from "../shipping/rates";

// ---- Cart model ----

export interface CartLine {
  sku: string;
  productId: string;
  quantity: number;
}

export interface Cart {
  id: string;
  customerId: string;
  lines: CartLine[];
  couponCode: string | null;
  updatedAt: number;
}

// Pure helpers — they return new carts and never mutate the input.

export function withLine(cart: Cart, line: CartLine, now: number): Cart {
  const existing = cart.lines.find((l) => l.sku === line.sku);
  const lines = existing
    ? cart.lines.map((l) => (l.sku === line.sku ? { ...l, quantity: l.quantity + line.quantity } : l))
    : [...cart.lines, line];
  return { ...cart, lines, updatedAt: now };
}

export function withQuantity(cart: Cart, sku: string, quantity: number, now: number): Cart {
  const lines =
    quantity <= 0 ? cart.lines.filter((l) => l.sku !== sku) : cart.lines.map((l) => (l.sku === sku ? { ...l, quantity } : l));
  return { ...cart, lines, updatedAt: now };
}

export function withoutLine(cart: Cart, sku: string, now: number): Cart {
  return withQuantity(cart, sku, 0, now);
}

export function itemCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.quantity, 0);
}

// ---- Service ----

interface Deps {
  clock: Clock;
  ids: IdGenerator;
  carts: CartRepository;
  products: ProductRepository;
  coupons: CouponRepository;
  pricing: PricingEngine;
}

export class CartService {
  constructor(private deps: Deps) {}

  getOrCreate(customerId: string): Cart {
    const existing = this.deps.carts.findByCustomer(customerId);
    if (existing) return existing;
    const cart: Cart = { id: this.deps.ids.next("cart"), customerId, lines: [], couponCode: null, updatedAt: this.deps.clock.now() };
    return this.deps.carts.save(cart);
  }

  addItem(customerId: string, sku: string, quantity: number): Cart {
    assertQuantity(quantity, 1);
    const found = this.deps.products.findBySku(sku);
    if (!found || !found.product.active) throw new NotFoundError(`sku ${sku} not found`);
    const cart = this.getOrCreate(customerId);
    const current = cart.lines.find((l) => l.sku === sku)?.quantity ?? 0;
    if (current + quantity > MAX_LINE_QUANTITY) {
      throw new ValidationError(`at most ${MAX_LINE_QUANTITY} of ${sku} per order`);
    }
    return this.deps.carts.save(withLine(cart, { sku, productId: found.product.id, quantity }, this.deps.clock.now()));
  }

  /** quantity 0 removes the line. */
  setQuantity(customerId: string, sku: string, quantity: number): Cart {
    assertQuantity(quantity, 0);
    if (quantity > MAX_LINE_QUANTITY) throw new ValidationError(`at most ${MAX_LINE_QUANTITY} of ${sku} per order`);
    const cart = this.getOrCreate(customerId);
    if (!cart.lines.some((l) => l.sku === sku)) throw new NotFoundError(`${sku} is not in the cart`);
    return this.deps.carts.save(withQuantity(cart, sku, quantity, this.deps.clock.now()));
  }

  removeItem(customerId: string, sku: string): Cart {
    const cart = this.getOrCreate(customerId);
    return this.deps.carts.save(withoutLine(cart, sku, this.deps.clock.now()));
  }

  applyCoupon(customerId: string, code: string): Cart {
    const coupon = this.deps.coupons.findByCode(code);
    if (!coupon) throw new ValidationError(`unknown coupon ${normalizeCode(code)}`);
    const usable = checkCouponUsable(coupon, this.deps.clock.now());
    if (!usable.ok) throw new ValidationError(usable.error);
    const cart = this.getOrCreate(customerId);
    return this.deps.carts.save({ ...cart, couponCode: coupon.code, updatedAt: this.deps.clock.now() });
  }

  removeCoupon(customerId: string): Cart {
    const cart = this.getOrCreate(customerId);
    return this.deps.carts.save({ ...cart, couponCode: null, updatedAt: this.deps.clock.now() });
  }

  clear(customerId: string): Cart {
    const cart = this.getOrCreate(customerId);
    return this.deps.carts.save({ ...cart, lines: [], couponCode: null, updatedAt: this.deps.clock.now() });
  }

  quote(customerId: string, opts: { region: string; shippingMethod: ShippingMethod }): Quote {
    const cart = this.getOrCreate(customerId);
    return this.deps.pricing.quote({
      lines: cart.lines,
      region: opts.region,
      shippingMethod: opts.shippingMethod,
      couponCode: cart.couponCode,
      customerId,
    });
  }
}

function assertQuantity(q: number, min: number) {
  if (!Number.isInteger(q) || q < min) throw new ValidationError(`quantity must be an integer >= ${min}`);
}
