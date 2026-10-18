import type { SurgeConfig } from "../config";
import type { DriverRegistry } from "../drivers/driver-registry";
import { encodeGeohash } from "../geo/geohash";
import type { LatLng } from "../geo/latlng";
import type { Clock } from "../shared/clock";
import type { EventBus } from "../shared/events";
import { type Bps, ONE_X_BPS } from "../shared/money";

/**
 * Surge multiplier for one zone, in basis points (PRICE-301 curve).
 *
 *  target: demand < 5 -> 1.0x; supply 0 -> maxBps; else
 *          1.0x + 0.625 * (demand/supply - 1.2), floored to 250 bps, clamped to [1.0x, maxBps]
 *  smoothing vs previousBps (clamped to maxBps): dead band < 500 bps keeps previous,
 *          otherwise move toward target by at most 2500 bps.
 */
export function computeSurgeBps(demand: number, supply: number, previousBps: Bps = ONE_X_BPS, maxBps: Bps = 30_000): Bps {
  if (!Number.isInteger(demand) || demand < 0) throw new RangeError("demand must be a non-negative integer");
  if (!Number.isInteger(supply) || supply < 0) throw new RangeError("supply must be a non-negative integer");
  if (!Number.isInteger(previousBps) || previousBps < ONE_X_BPS) throw new RangeError("previousBps must be an integer >= 10000");
  if (!Number.isInteger(maxBps) || maxBps < ONE_X_BPS) throw new RangeError("maxBps must be an integer >= 10000");

  let target: Bps;
  if (demand < 5) target = ONE_X_BPS;
  else if (supply === 0) target = maxBps;
  else {
    // 6250 * (d/s - 1.2) == (6250d - 7500s) / s, kept in integers so steps are exact.
    const num = 6_250 * demand - 7_500 * supply;
    const extra = num <= 0 ? 0 : Math.floor(num / (supply * 250)) * 250;
    target = Math.min(maxBps, ONE_X_BPS + extra);
  }

  const prev = Math.min(previousBps, maxBps);
  const diff = target - prev;
  if (Math.abs(diff) < 500) return prev;
  return prev + Math.max(-2_500, Math.min(2_500, diff));
}

export interface ZoneSurge {
  zone: string;
  bps: Bps;
  demand: number;
  supply: number;
  updatedAt: number;
}

/**
 * Tracks demand per zone (from trip.requested events) and recomputes surge
 * on demand — production runs `recompute()` from a 60s cron. Trips lock the
 * zone's surge at request time via `bpsAt(pickup)`.
 */
export class SurgeService {
  private readonly zones = new Map<string, ZoneSurge>();
  private readonly demand = new Map<string, number[]>(); // zone -> request timestamps

  constructor(private readonly deps: { registry: DriverRegistry; bus: EventBus; clock: Clock; config: SurgeConfig }) {
    deps.bus.on("trip.requested", (e) => {
      const pickup = e.data.pickup as LatLng | undefined;
      if (pickup) this.recordDemand(pickup, e.at);
    });
  }

  zoneOf(p: LatLng): string {
    return encodeGeohash(p, this.deps.config.geohashPrecision);
  }

  bpsAt(p: LatLng): Bps {
    return this.zones.get(this.zoneOf(p))?.bps ?? ONE_X_BPS;
  }

  /** Manual override (ops console, tests). Cleared by the next recompute(). */
  setZoneBps(zone: string, bps: Bps): void {
    if (!Number.isInteger(bps) || bps < ONE_X_BPS) throw new RangeError("surge bps must be an integer >= 10000");
    this.zones.set(zone, { zone, bps, demand: 0, supply: 0, updatedAt: this.deps.clock.now() });
  }

  recordDemand(p: LatLng, at: number): void {
    const zone = this.zoneOf(p);
    const list = this.demand.get(zone) ?? [];
    list.push(at);
    this.demand.set(zone, list);
  }

  recompute(): ZoneSurge[] {
    const now = this.deps.clock.now();
    const cutoff = now - this.deps.config.demandWindowMs;
    const supply = new Map<string, number>();
    for (const d of this.deps.registry.list()) {
      if (!this.deps.registry.isDispatchable(d)) continue;
      const z = this.zoneOf(d.location!);
      supply.set(z, (supply.get(z) ?? 0) + 1);
    }
    const zones = new Set<string>([...this.demand.keys(), ...supply.keys(), ...this.zones.keys()]);
    const out: ZoneSurge[] = [];
    for (const zone of zones) {
      const recent = (this.demand.get(zone) ?? []).filter((t) => t > cutoff);
      if (recent.length) this.demand.set(zone, recent);
      else this.demand.delete(zone);
      const prev = this.zones.get(zone)?.bps ?? ONE_X_BPS;
      const bps = computeSurgeBps(recent.length, supply.get(zone) ?? 0, prev, this.deps.config.maxBps);
      const z: ZoneSurge = { zone, bps, demand: recent.length, supply: supply.get(zone) ?? 0, updatedAt: now };
      this.zones.set(zone, z);
      if (bps !== prev) this.deps.bus.emit({ type: "surge.updated", at: now, entityId: zone, data: { from: prev, to: bps } });
      out.push(z);
    }
    return out.sort((a, b) => (a.zone < b.zone ? -1 : 1));
  }

  snapshot(): ZoneSurge[] {
    return [...this.zones.values()];
  }
}
