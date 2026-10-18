import type { Bps, Cents } from "./shared/money";

export interface PricingConfig {
  baseFareCents: Cents;
  perKmCents: Cents;
  perMinuteCents: Cents;
  /** Floor for the ride portion of the fare (after surge, before fees/promos). */
  minimumFareCents: Cents;
  /** Flat fee added to every completed trip. Never surged, never discounted. */
  bookingFeeCents: Cents;
}

export interface SurgeConfig {
  /** Surge zones are geohash cells of this precision (5 ≈ 4.9km x 4.9km). */
  geohashPrecision: number;
  /** Trip requests older than this no longer count as demand. */
  demandWindowMs: number;
  maxBps: Bps;
}

export interface MatchingConfig {
  searchRadiusKm: number;
  /** How many drivers we offer a trip to (sequentially) before giving up. */
  maxOffers: number;
  /** Drivers whose last location ping is older than this are not dispatchable. */
  maxLocationAgeMs: number;
  /** Straight-line -> road distance fudge factor. */
  roadFactor: number;
  avgSpeedKmh: number;
  /** Fixed time for the driver to accept, start moving, etc. */
  pickupOverheadSec: number;
  /** Batch mode: how many nearest drivers each request considers. */
  candidatesPerRequest: number;
}

export interface TripConfig {
  /** Riders may cancel for free for this long after a driver is matched. */
  freeCancelWindowMs: number;
  riderCancelFeeCents: Cents;
}

export interface PayoutConfig {
  /** Platform commission on the ride fare. */
  commissionBps: Bps;
  /** Share of a cancellation fee that goes to the driver. */
  cancellationShareBps: Bps;
}

export interface FleetConfig {
  currency: string;
  pricing: PricingConfig;
  surge: SurgeConfig;
  matching: MatchingConfig;
  trips: TripConfig;
  payouts: PayoutConfig;
  /** Spatial index cell size in degrees (0.02° ≈ 2.2km of latitude). */
  indexCellDeg: number;
}

export const DEFAULT_CONFIG: FleetConfig = {
  currency: "USD",
  pricing: {
    baseFareCents: 250,
    perKmCents: 120,
    perMinuteCents: 30,
    minimumFareCents: 800,
    bookingFeeCents: 175,
  },
  surge: {
    geohashPrecision: 5,
    demandWindowMs: 10 * 60_000,
    maxBps: 30_000,
  },
  matching: {
    searchRadiusKm: 5,
    maxOffers: 3,
    maxLocationAgeMs: 2 * 60_000,
    roadFactor: 1.35,
    avgSpeedKmh: 28,
    pickupOverheadSec: 60,
    candidatesPerRequest: 8,
  },
  trips: {
    freeCancelWindowMs: 2 * 60_000,
    riderCancelFeeCents: 500,
  },
  payouts: {
    commissionBps: 2_500,
    cancellationShareBps: 8_000,
  },
  indexCellDeg: 0.02,
};

export type ConfigOverrides = {
  [K in keyof FleetConfig]?: FleetConfig[K] extends object ? Partial<FleetConfig[K]> : FleetConfig[K];
};

export function buildConfig(overrides: ConfigOverrides = {}): FleetConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    pricing: { ...DEFAULT_CONFIG.pricing, ...overrides.pricing },
    surge: { ...DEFAULT_CONFIG.surge, ...overrides.surge },
    matching: { ...DEFAULT_CONFIG.matching, ...overrides.matching },
    trips: { ...DEFAULT_CONFIG.trips, ...overrides.trips },
    payouts: { ...DEFAULT_CONFIG.payouts, ...overrides.payouts },
  } as FleetConfig;
}
