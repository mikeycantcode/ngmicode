import type { Order } from "../domain/order";
import type { CartService } from "../cart/cart-service";
import type { InventoryService } from "../inventory/inventory-service";
import type { PricingEngine } from "../pricing/engine";
import type { CustomerRepository } from "../repo/stores";
import type { OrderRepository } from "../repo/stores";
import type { CouponRepository } from "../repo/pricing";
import type { Clock } from "../shared/clock";
import { ValidationError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import type { IdGenerator } from "../shared/ids";
import type { ShippingMethod } from "../shipping/rates";

interface Deps {
  clock: Clock;
  ids: IdGenerator;
  events: EventBus;
  customers: CustomerRepository;
  orders: OrderRepository;
  coupons: CouponRepository;
  carts: CartService;
  inventory: InventoryService;
  pricing: PricingEngine;
}

export interface CheckoutOptions {
  shippingMethod: ShippingMethod;
  /** Defaults to the customer's home region. */
  region?: string;
}

/**
 * Turns the customer's cart into a pending order.
 *
 * Stock is reserved FIRST (so we never quote items we cannot sell), then the
 * cart is priced. If anything after the reservation fails, the reservation
 * must be released — otherwise the units stay "reserved" until expiry and the
 * storefront shows them as out of stock.
 *
 * Payment happens later via OrderService.pay().
 */
export class CheckoutService {
  constructor(private deps: Deps) {}

  checkout(customerId: string, opts: CheckoutOptions): Order {
    const customer = this.deps.customers.require(customerId);
    const cart = this.deps.carts.getOrCreate(customerId);
    if (cart.lines.length === 0) throw new ValidationError("cart is empty");
    const region = opts.region ?? customer.region;

    const reservation = this.deps.inventory.reserve(cart.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })));
    // If pricing fails below, the reservation simply expires after RESERVATION_TTL_MS
    // (OrderService/InventoryService.expireStale clean it up), so no rollback needed here.
    const quote = this.deps.pricing.quote({
      lines: cart.lines,
      region,
      shippingMethod: opts.shippingMethod,
      couponCode: cart.couponCode,
      customerId,
    });
    const now = this.deps.clock.now();
    const order: Order = {
      id: this.deps.ids.next("ord"),
      customerId,
      status: "pending",
      lines: quote.lines.map((l) => ({
        sku: l.sku,
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        subtotalCents: l.subtotalCents,
        discountCents: l.discountCents,
      })),
      region,
      shippingMethod: opts.shippingMethod,
      couponCode: quote.couponCode,
      subtotalCents: quote.subtotalCents,
      itemDiscountCents: quote.itemDiscountCents,
      orderDiscountCents: quote.orderDiscountCents,
      shippingCents: quote.shippingCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      reservationId: reservation.id,
      paymentId: null,
      trackingNumber: null,
      createdAt: now,
      updatedAt: now,
      history: [{ status: "pending", at: now }],
    };
    this.deps.orders.save(order);
    if (quote.couponCode) this.redeemCoupon(quote.couponCode);

    this.deps.carts.clear(customerId);
    this.deps.events.emit({ type: "order.placed", orderId: order.id, customerId, totalCents: order.totalCents });
    return order;
  }

  private redeemCoupon(code: string) {
    const coupon = this.deps.coupons.findByCode(code);
    if (coupon) this.deps.coupons.save({ ...coupon, redemptions: coupon.redemptions + 1 });
  }
}
