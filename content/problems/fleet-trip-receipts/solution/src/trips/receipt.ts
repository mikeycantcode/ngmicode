import { ConflictError } from "../shared/errors";
import { type Cents, formatMultiplier, sumCents } from "../shared/money";
import type { Trip } from "./trip";

export type LineItemCode =
  | "base"
  | "distance"
  | "time"
  | "surge"
  | "minimum_fare"
  | "booking_fee"
  | "promo"
  | "cancellation_fee";

export interface ReceiptLineItem {
  code: LineItemCode;
  label: string;
  amountCents: Cents;
}

export interface Receipt {
  tripId: string;
  status: "completed" | "cancelled";
  currency: string;
  issuedAt: number;
  lineItems: ReceiptLineItem[];
  totalCents: Cents;
}

/**
 * Rider-facing receipt. Line items are in a fixed order, zero amounts are
 * omitted, discounts are negative, and amounts always sum to totalCents.
 */
export function buildReceipt(trip: Trip, currency: string): Receipt {
  if (trip.status === "completed" && trip.fare) {
    const f = trip.fare;
    const km = ((trip.distanceMeters ?? 0) / 1000).toFixed(2);
    const min = Math.round((trip.durationSec ?? 0) / 60);
    const items: ReceiptLineItem[] = [
      { code: "base", label: "Base fare", amountCents: f.baseCents },
      { code: "distance", label: `Distance (${km} km)`, amountCents: f.distanceCents },
      { code: "time", label: `Time (${min} min)`, amountCents: f.timeCents },
      { code: "surge", label: `Surge (${formatMultiplier(f.surgeBps)})`, amountCents: f.surgeCents },
      { code: "minimum_fare", label: "Minimum fare adjustment", amountCents: f.minimumFareAdjustmentCents },
      { code: "booking_fee", label: "Booking fee", amountCents: f.bookingFeeCents },
      { code: "promo", label: `Promo ${trip.promoCode ?? ""}`.trim(), amountCents: -f.discountCents },
    ];
    return finish(trip, f.currency, trip.completedAt!, items, f.totalCents);
  }
  if (trip.status === "cancelled" && trip.cancellationFeeCents > 0) {
    const items: ReceiptLineItem[] = [{ code: "cancellation_fee", label: "Cancellation fee", amountCents: trip.cancellationFeeCents }];
    return finish(trip, currency, trip.cancelledAt!, items, trip.cancellationFeeCents);
  }
  throw new ConflictError("receipt_unavailable", `no receipt for a ${trip.status} trip without charges`);
}

function finish(trip: Trip, currency: string, issuedAt: number, items: ReceiptLineItem[], totalCents: Cents): Receipt {
  const lineItems = items.filter((i) => i.amountCents !== 0);
  if (sumCents(lineItems.map((i) => i.amountCents)) !== totalCents) {
    throw new Error(`receipt for ${trip.id} does not balance`);
  }
  return { tripId: trip.id, status: trip.status as Receipt["status"], currency, issuedAt, lineItems, totalCents };
}
