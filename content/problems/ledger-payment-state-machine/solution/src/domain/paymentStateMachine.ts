import { InvalidTransitionError } from "./errors";
import type { PaymentStatus } from "./payment";

export type PaymentEvent = "capture" | "void" | "expire" | "refund" | "refund_full";

const EVENT_ORDER: PaymentEvent[] = ["capture", "void", "expire", "refund", "refund_full"];

const TRANSITIONS: Record<PaymentStatus, Partial<Record<PaymentEvent, PaymentStatus>>> = {
  authorized: { capture: "captured", void: "voided", expire: "expired" },
  captured: { refund: "partially_refunded", refund_full: "refunded" },
  partially_refunded: { refund: "partially_refunded", refund_full: "refunded" },
  refunded: {},
  voided: {},
  expired: {},
};

const VERB: Record<PaymentEvent, string> = {
  capture: "capture",
  void: "void",
  expire: "expire",
  refund: "refund",
  refund_full: "refund",
};

/** Next status for `event`, or InvalidTransitionError("cannot <verb> payment in status <status>"). */
export function transition(status: PaymentStatus, event: PaymentEvent): PaymentStatus {
  const next = TRANSITIONS[status]?.[event];
  if (!next) throw new InvalidTransitionError(`cannot ${VERB[event]} payment in status ${status}`);
  return next;
}

export function allowedEvents(status: PaymentStatus): PaymentEvent[] {
  return EVENT_ORDER.filter((e) => TRANSITIONS[status]?.[e] !== undefined);
}

export function canTransition(status: PaymentStatus, event: PaymentEvent): boolean {
  return TRANSITIONS[status]?.[event] !== undefined;
}
