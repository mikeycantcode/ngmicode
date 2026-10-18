import { ConflictError } from "../shared/errors";
import type { ShippingMethod } from "../shipping/rates";

export type OrderStatus = "pending" | "paid" | "shipped" | "delivered" | "cancelled";

/** Allowed status transitions. Anything not listed here is rejected. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export interface OrderLine {
  sku: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  /** quantity * unitPriceCents */
  subtotalCents: number;
  /** Item-level discounts (promotions, volume tiers) applied to this line. */
  discountCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  lines: OrderLine[];
  region: string;
  shippingMethod: ShippingMethod;
  couponCode: string | null;
  subtotalCents: number;
  /** Sum of line.discountCents */
  itemDiscountCents: number;
  /** Order-level discounts (coupons). */
  orderDiscountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  reservationId: string | null;
  paymentId: string | null;
  trackingNumber: string | null;
  createdAt: number;
  updatedAt: number;
  history: Array<{ status: OrderStatus; at: number; note?: string }>;
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(order: Order, to: OrderStatus, at: number, note?: string): Order {
  if (!canTransition(order.status, to)) {
    throw new ConflictError(`cannot transition order ${order.id} from ${order.status} to ${to}`);
  }
  return {
    ...order,
    status: to,
    updatedAt: at,
    history: [...order.history, note ? { status: to, at, note } : { status: to, at }],
  };
}
