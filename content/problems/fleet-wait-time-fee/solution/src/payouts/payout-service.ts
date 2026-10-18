import type { PayoutConfig } from "../config";
import type { Clock } from "../shared/clock";
import { ValidationError } from "../shared/errors";
import type { EventBus, FleetEvent } from "../shared/events";
import type { IdGenerator } from "../shared/ids";
import { applyBps, type Cents, sumCents } from "../shared/money";
import type { TripService } from "../trips/trip-service";

export type LedgerKind = "trip_earnings" | "cancellation_fee";

/** One line of driver earnings. Immutable once written; payoutId set when paid. */
export interface LedgerEntry {
  id: string;
  driverId: string;
  tripId: string;
  kind: LedgerKind;
  /** What the platform collected that this entry is based on. */
  grossCents: Cents;
  commissionCents: Cents;
  /** What the driver earns: gross - commission. */
  amountCents: Cents;
  /** epoch ms the earning happened (trip completion / cancellation) */
  at: number;
  payoutId: string | null;
}

export interface Statement {
  driverId: string;
  from: number;
  to: number;
  entries: LedgerEntry[];
  totalCents: Cents;
}

export interface Payout {
  id: string;
  driverId: string;
  periodEnd: number;
  entryIds: string[];
  amountCents: Cents;
  createdAt: number;
}

/**
 * Driver earnings ledger, fed by trip events.
 *
 *  - trip_earnings: commission is taken on the RIDE portion of the fare
 *    BEFORE promo discounts (promos are platform-funded, drivers don't pay
 *    for them). The booking fee is 100% platform revenue. Waiting fees are
 *    included in gross and are commission-free.
 *  - cancellation_fee: the driver gets `cancellationShareBps` of the fee.
 */
export class PayoutService {
  private readonly ledger: LedgerEntry[] = [];
  private readonly payouts: Payout[] = [];

  constructor(
    private readonly deps: { bus: EventBus; clock: Clock; ids: IdGenerator; config: PayoutConfig; trips: TripService },
  ) {
    deps.bus.on("trip.completed", (e) => this.onCompleted(e));
    deps.bus.on("trip.cancelled", (e) => this.onCancelled(e));
  }

  private onCompleted(e: FleetEvent) {
    const trip = this.deps.trips.get(e.entityId);
    if (!trip.driverId || !trip.fare) return;
    // Waiting fees go 100% to the driver: commission only on the ride portion.
    const gross = trip.fare.rideCents + (trip.fare.waitingCents ?? 0);
    const commission = applyBps(trip.fare.rideCents, this.deps.config.commissionBps);
    this.append({ driverId: trip.driverId, tripId: trip.id, kind: "trip_earnings", grossCents: gross, commissionCents: commission, at: e.at });
  }

  private onCancelled(e: FleetEvent) {
    const trip = this.deps.trips.get(e.entityId);
    if (!trip.driverId || trip.cancellationFeeCents <= 0) return;
    const gross = trip.cancellationFeeCents;
    const driverShare = applyBps(gross, this.deps.config.cancellationShareBps);
    this.append({ driverId: trip.driverId, tripId: trip.id, kind: "cancellation_fee", grossCents: gross, commissionCents: gross - driverShare, at: e.at });
  }

  private append(p: Omit<LedgerEntry, "id" | "amountCents" | "payoutId">) {
    this.ledger.push({ ...p, id: this.deps.ids.next("led"), amountCents: p.grossCents - p.commissionCents, payoutId: null });
  }

  entries(driverId: string): LedgerEntry[] {
    return this.ledger.filter((l) => l.driverId === driverId).map((l) => ({ ...l }));
  }

  /** Entries with from <= at < to. */
  statement(driverId: string, from: number, to: number): Statement {
    if (!(from <= to)) throw new ValidationError("from must be <= to");
    const entries = this.entries(driverId).filter((l) => l.at >= from && l.at < to);
    return { driverId, from, to, entries, totalCents: sumCents(entries.map((e) => e.amountCents)) };
  }

  /**
   * Pays out every unpaid entry with at < periodEnd. Idempotent: running it
   * again for the same period returns null (nothing left to pay).
   */
  runPayout(driverId: string, periodEnd: number): Payout | null {
    const due = this.ledger.filter((l) => l.driverId === driverId && l.payoutId === null && l.at < periodEnd);
    if (!due.length) return null;
    const payout: Payout = {
      id: this.deps.ids.next("pay"),
      driverId,
      periodEnd,
      entryIds: due.map((l) => l.id),
      amountCents: sumCents(due.map((l) => l.amountCents)),
      createdAt: this.deps.clock.now(),
    };
    for (const l of due) l.payoutId = payout.id;
    this.payouts.push(payout);
    this.deps.bus.emit({ type: "payout.created", at: payout.createdAt, entityId: payout.id, data: { driverId, amountCents: payout.amountCents } });
    return { ...payout };
  }

  listPayouts(driverId: string): Payout[] {
    return this.payouts.filter((p) => p.driverId === driverId).map((p) => ({ ...p }));
  }
}
