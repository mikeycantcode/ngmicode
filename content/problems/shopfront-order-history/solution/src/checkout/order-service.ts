import { PENDING_ORDER_TTL_MS } from "../config";
import { transition, type Order, type OrderStatus } from "../domain/order";
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
  customerId?: string;
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

  /** Newest first (ties: higher id first). Admin listing, or one customer's history with customerId. */
  list(filter: OrderFilter = {}): Page<Order> {
    const rows = this.deps.orders
      .find((o) => (!filter.status || o.status === filter.status) && (!filter.customerId || o.customerId === filter.customerId))
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
    return paginate(rows, filter.page, filter.pageSize);
  }
}
