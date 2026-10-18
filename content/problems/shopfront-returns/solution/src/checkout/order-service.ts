import { PENDING_ORDER_TTL_MS, RETURN_WINDOW_DAYS } from "../config";
import { deliveredAt, transition, type Order, type OrderStatus } from "../domain/order";
import { DAY } from "../shared/clock";
import { allocateCents } from "../shared/money";
import type { InventoryService } from "../inventory/inventory-service";
import type { OrderRepository } from "../repo/stores";
import type { Clock } from "../shared/clock";
import { ConflictError, ValidationError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import { paginate, type Page } from "../shared/paging";
import type { PaymentGateway } from "./payments";

interface Deps {
  clock: Clock;
  events: EventBus;
  orders: OrderRepository;
  inventory: InventoryService;
  payments: PaymentGateway;
}

export interface OrderFilter {
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
}

export class OrderService {
  constructor(private deps: Deps) {}

  get(id: string): Order | undefined {
    return this.deps.orders.get(id);
  }

  require(id: string): Order {
    return this.deps.orders.require(id);
  }

  /**
   * Charges the order total and converts the stock reservation into a permanent
   * deduction. A declined card leaves the order pending (customer may retry).
   */
  pay(orderId: string, paymentToken: string): Order {
    const order = this.require(orderId);
    if (order.status !== "pending") throw new ConflictError(`order ${orderId} is ${order.status}, not pending`);
    if (order.reservationId) {
      const r = this.deps.inventory.getReservation(order.reservationId);
      if (!r || r.status !== "active") throw new ConflictError(`order ${orderId} has expired; please check out again`);
    }
    const charge = this.deps.payments.charge(order.totalCents, paymentToken, order.id);
    if (order.reservationId) this.deps.inventory.commit(order.reservationId);
    const paid = { ...transition(order, "paid", this.deps.clock.now()), paymentId: charge.id };
    this.deps.orders.save(paid);
    this.deps.events.emit({ type: "order.paid", orderId, paymentId: charge.id });
    return paid;
  }

  ship(orderId: string, trackingNumber: string): Order {
    if (!trackingNumber || typeof trackingNumber !== "string") throw new ValidationError("trackingNumber is required");
    const order = this.require(orderId);
    const shipped = { ...transition(order, "shipped", this.deps.clock.now()), trackingNumber };
    this.deps.orders.save(shipped);
    this.deps.events.emit({ type: "order.shipped", orderId, trackingNumber });
    return shipped;
  }

  deliver(orderId: string): Order {
    const order = this.require(orderId);
    const delivered = transition(order, "delivered", this.deps.clock.now());
    this.deps.orders.save(delivered);
    this.deps.events.emit({ type: "order.delivered", orderId });
    return delivered;
  }

  /**
   * Customer return of delivered units. Refund = what the customer actually paid
   * for those units (goods after all discounts, plus tax; never shipping), computed
   * cumulatively so any sequence of partial returns sums exactly to the full amount.
   */
  returnItems(orderId: string, lines: Array<{ sku: string; quantity: number }>): { refundCents: number; order: Order } {
    const order = this.require(orderId);
    const now = this.deps.clock.now();
    const delivered = deliveredAt(order);
    if (order.status !== "delivered" || delivered === undefined) {
      throw new ConflictError(`order ${orderId} is ${order.status}; only delivered orders can be returned`);
    }
    if (now > delivered + RETURN_WINDOW_DAYS * DAY) throw new ConflictError(`the ${RETURN_WINDOW_DAYS}-day return window has closed`);

    if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError("lines must be a non-empty array");
    const returnedBefore = returnedQuantities(order);
    const requested = new Map<string, number>();
    const errors: string[] = [];
    lines.forEach((l, i) => {
      const line = order.lines.find((ol) => ol.sku === l?.sku);
      if (!line) errors.push(`lines[${i}].sku is not part of this order`);
      else if (requested.has(l.sku)) errors.push(`lines[${i}].sku is duplicated`);
      else if (!Number.isInteger(l.quantity) || l.quantity < 1) errors.push(`lines[${i}].quantity must be a positive integer`);
      else if ((returnedBefore.get(l.sku) ?? 0) + l.quantity > line.quantity) errors.push(`lines[${i}].quantity exceeds the returnable quantity`);
      else requested.set(l.sku, l.quantity);
    });
    if (errors.length) throw new ValidationError("invalid return", errors);

    const paid = allocateCents(
      order.totalCents - order.shippingCents,
      order.lines.map((l) => l.subtotalCents - l.discountCents),
    );
    const value = (i: number, k: number) => Math.floor((paid[i] * k) / order.lines[i].quantity);
    let refundCents = 0;
    order.lines.forEach((line, i) => {
      const n = requested.get(line.sku);
      if (!n) return;
      const before = returnedBefore.get(line.sku) ?? 0;
      refundCents += value(i, before + n) - value(i, before);
    });

    if (refundCents > 0 && order.paymentId) this.deps.payments.refund(order.paymentId, refundCents);
    for (const [sku, quantity] of requested) this.deps.inventory.restock(sku, quantity);

    const record = { lines: [...requested].map(([sku, quantity]) => ({ sku, quantity })), refundCents, at: now };
    let next: Order = {
      ...order,
      returns: [...(order.returns ?? []), record],
      refundedCents: (order.refundedCents ?? 0) + refundCents,
      updatedAt: now,
    };
    const allBack = order.lines.every((l) => (returnedBefore.get(l.sku) ?? 0) + (requested.get(l.sku) ?? 0) === l.quantity);
    if (allBack) next = transition(next, "returned", now);
    this.deps.orders.save(next);
    this.deps.events.emit({ type: "order.returned", orderId, refundCents });
    return { refundCents, order: next };
  }

  /** Cancels unpaid orders older than the TTL and frees their stock. Returns cancelled ids. */
  expirePending(): string[] {
    const now = this.deps.clock.now();
    const stale = this.deps.orders.find((o) => o.status === "pending" && o.createdAt + PENDING_ORDER_TTL_MS <= now);
    for (const order of stale) {
      if (order.reservationId) this.deps.inventory.release(order.reservationId);
      this.deps.orders.save(transition(order, "cancelled", now, "expired"));
      this.deps.events.emit({ type: "order.cancelled", orderId: order.id, reason: "expired" });
    }
    return stale.map((o) => o.id);
  }

  /** Admin listing: newest first. */
  list(filter: OrderFilter = {}): Page<Order> {
    const rows = this.deps.orders
      .find((o) => !filter.status || o.status === filter.status)
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
    return paginate(rows, filter.page, filter.pageSize);
  }
}

function returnedQuantities(order: Order): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of order.returns ?? []) for (const l of r.lines) out.set(l.sku, (out.get(l.sku) ?? 0) + l.quantity);
  return out;
}
