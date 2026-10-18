import { LOW_STOCK_THRESHOLD, RESERVATION_TTL_MS } from "../config";
import type { Clock } from "../shared/clock";
import { ConflictError, NotFoundError, OutOfStockError, ValidationError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import type { IdGenerator } from "../shared/ids";

export interface StockLevel {
  sku: string;
  /** Physical units in the warehouse. */
  onHand: number;
  /** Units held by active reservations. available = onHand - reserved. */
  reserved: number;
}

export type ReservationStatus = "active" | "released" | "committed";

export interface ReservationLine {
  sku: string;
  quantity: number;
}

export interface Reservation {
  id: string;
  lines: ReservationLine[];
  status: ReservationStatus;
  createdAt: number;
  expiresAt: number;
}

interface Deps {
  clock: Clock;
  events: EventBus;
  ids: IdGenerator;
}

/**
 * Stock levels and reservations.
 *
 * Lifecycle: reserve() holds units for a pending order. Then exactly one of:
 *   - commit(): payment captured — units leave onHand for good.
 *   - release(): checkout failed / order cancelled / reservation expired — units
 *     become available again.
 * Once committed, units can only come back via restock() (e.g. returns).
 */
export class InventoryService {
  private stock = new Map<string, StockLevel>();
  private reservations = new Map<string, Reservation>();

  constructor(private deps: Deps) {}

  setStock(sku: string, onHand: number): void {
    if (!Number.isInteger(onHand) || onHand < 0) throw new ValidationError("onHand must be a non-negative integer");
    const level = this.stock.get(sku);
    if (level && onHand < level.reserved) {
      throw new ConflictError(`cannot set ${sku} below reserved quantity (${level.reserved})`);
    }
    this.stock.set(sku, { sku, onHand, reserved: level?.reserved ?? 0 });
  }

  level(sku: string): StockLevel {
    const l = this.stock.get(sku);
    return l ? { ...l } : { sku, onHand: 0, reserved: 0 };
  }

  available(sku: string): number {
    const l = this.stock.get(sku);
    return l ? l.onHand - l.reserved : 0;
  }

  /** Admin correction (cycle count, damage, ...). */
  adjust(sku: string, delta: number, reason: string): StockLevel {
    if (!Number.isInteger(delta) || delta === 0) throw new ValidationError("delta must be a non-zero integer");
    const l = this.stock.get(sku) ?? { sku, onHand: 0, reserved: 0 };
    if (l.onHand + delta < l.reserved) {
      throw new ConflictError(`adjustment would put ${sku} below reserved quantity`);
    }
    l.onHand += delta;
    this.stock.set(sku, l);
    this.deps.events.emit({ type: "inventory.adjusted", sku, delta, reason });
    this.checkLow(sku);
    return { ...l };
  }

  /** Units coming back into sellable stock (returns, cancelled-after-payment). */
  restock(sku: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new ValidationError("quantity must be a positive integer");
    const l = this.stock.get(sku) ?? { sku, onHand: 0, reserved: 0 };
    l.onHand += quantity;
    this.stock.set(sku, l);
  }

  /**
   * All-or-nothing: either every line is reserved or none is and an
   * OutOfStockError is thrown for the first line that cannot be satisfied.
   */
  reserve(lines: ReservationLine[], ttlMs = RESERVATION_TTL_MS): Reservation {
    const merged = mergeLines(lines);
    for (const line of merged) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new ValidationError(`invalid quantity for ${line.sku}`);
      }
      const available = this.available(line.sku);
      if (available < line.quantity) throw new OutOfStockError(line.sku, line.quantity, available);
    }
    for (const line of merged) {
      this.stock.get(line.sku)!.reserved += line.quantity;
    }
    const now = this.deps.clock.now();
    const reservation: Reservation = {
      id: this.deps.ids.next("res"),
      lines: merged,
      status: "active",
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    this.reservations.set(reservation.id, reservation);
    for (const line of merged) this.checkLow(line.sku);
    return { ...reservation, lines: merged.map((l) => ({ ...l })) };
  }

  getReservation(id: string): Reservation | undefined {
    const r = this.reservations.get(id);
    return r ? { ...r, lines: r.lines.map((l) => ({ ...l })) } : undefined;
  }

  /** Idempotent: releasing an already-released reservation is a no-op. */
  release(reservationId: string): void {
    const r = this.requireReservation(reservationId);
    if (r.status === "released") return;
    if (r.status === "committed") throw new ConflictError(`reservation ${reservationId} is already committed`);
    for (const line of r.lines) this.stock.get(line.sku)!.reserved -= line.quantity;
    r.status = "released";
  }

  commit(reservationId: string): void {
    const r = this.requireReservation(reservationId);
    if (r.status === "committed") return;
    if (r.status === "released") throw new ConflictError(`reservation ${reservationId} was released`);
    for (const line of r.lines) {
      const l = this.stock.get(line.sku)!;
      l.reserved -= line.quantity;
      l.onHand -= line.quantity;
    }
    r.status = "committed";
  }

  /** Releases active reservations past their expiry. Returns released ids. */
  expireStale(): string[] {
    const now = this.deps.clock.now();
    const released: string[] = [];
    for (const r of this.reservations.values()) {
      if (r.status === "active" && r.expiresAt <= now) {
        this.release(r.id);
        released.push(r.id);
      }
    }
    return released;
  }

  private requireReservation(id: string): Reservation {
    const r = this.reservations.get(id);
    if (!r) throw new NotFoundError(`reservation ${id} not found`);
    return r;
  }

  private checkLow(sku: string): void {
    const available = this.available(sku);
    if (available <= LOW_STOCK_THRESHOLD) this.deps.events.emit({ type: "inventory.low_stock", sku, available });
  }
}

function mergeLines(lines: ReservationLine[]): ReservationLine[] {
  const bySku = new Map<string, number>();
  for (const l of lines) bySku.set(l.sku, (bySku.get(l.sku) ?? 0) + l.quantity);
  return [...bySku].map(([sku, quantity]) => ({ sku, quantity }));
}
