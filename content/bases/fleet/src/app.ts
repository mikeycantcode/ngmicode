import { TokenAuth } from "./api/auth";
import { registerRoutes } from "./api/handlers";
import { type ApiRequest, type ApiResponse, ApiServer, Router } from "./api/http";
import { buildConfig, type ConfigOverrides, type FleetConfig } from "./config";
import { DriverRegistry } from "./drivers/driver-registry";
import { InMemoryDriverStore } from "./drivers/driver";
import { EventLog } from "./events/event-log";
import { GridIndex } from "./geo/grid-index";
import { BatchDispatcher } from "./matching/batch-dispatcher";
import { AutoAcceptGateway, Dispatcher, type OfferGateway } from "./matching/dispatcher";
import { PayoutService } from "./payouts/payout-service";
import { PromoService } from "./pricing/promos";
import { QuoteService } from "./pricing/quote-service";
import { SurgeService } from "./pricing/surge";
import { RatingService } from "./ratings/rating-service";
import { RiderService } from "./riders/rider-service";
import { type Clock, FakeClock } from "./shared/clock";
import { EventBus } from "./shared/events";
import { IdGenerator } from "./shared/ids";
import { type Logger, MemoryLogger } from "./shared/logger";
import { SeededRng } from "./shared/rng";
import { InMemoryTripStore } from "./trips/trip";
import { TripService } from "./trips/trip-service";

export interface FleetOptions {
  clock?: Clock;
  seed?: number;
  config?: ConfigOverrides;
  offers?: OfferGateway;
  logger?: Logger;
}

export interface FleetServices {
  config: FleetConfig;
  clock: Clock;
  rng: SeededRng;
  ids: IdGenerator;
  bus: EventBus;
  logger: Logger;
  eventLog: EventLog;
  auth: TokenAuth;
  drivers: DriverRegistry;
  riders: RiderService;
  promos: PromoService;
  surge: SurgeService;
  quotes: QuoteService;
  trips: TripService;
  dispatcher: Dispatcher;
  batch: BatchDispatcher;
  payouts: PayoutService;
  ratings: RatingService;
}

export interface Fleet extends FleetServices {
  api: ApiServer;
  /** Token for an "ops" admin principal. */
  adminToken: string;
  /** Shorthand for api.handle with a bearer token. */
  call(method: ApiRequest["method"], path: string, token?: string | null, body?: unknown, query?: Record<string, string>): Promise<ApiResponse>;
}

/** Composition root. Wires every service with shared clock/bus/ids/config. */
export function createFleet(opts: FleetOptions = {}): Fleet {
  const config = buildConfig(opts.config);
  const clock = opts.clock ?? new FakeClock();
  const rng = new SeededRng(opts.seed ?? 42);
  const ids = new IdGenerator();
  const bus = new EventBus();
  const logger = opts.logger ?? new MemoryLogger();
  bus.onHandlerError = (err, e) => logger.error("event handler failed", { type: e.type, err: String(err) });

  const eventLog = new EventLog(bus);
  const auth = new TokenAuth();
  const drivers = new DriverRegistry({
    store: new InMemoryDriverStore(),
    index: new GridIndex(config.indexCellDeg),
    bus,
    clock,
    ids,
    config: config.matching,
  });
  const riders = new RiderService({ bus, clock, ids });
  const promos = new PromoService({ clock });
  const surge = new SurgeService({ registry: drivers, bus, clock, config: config.surge });
  const quotes = new QuoteService({ registry: drivers, surge, promos, clock, config });
  const trips = new TripService({ store: new InMemoryTripStore(), registry: drivers, riders, promos, surge, bus, clock, ids, config });
  const dispatcher = new Dispatcher({
    registry: drivers,
    trips,
    offers: opts.offers ?? new AutoAcceptGateway(),
    bus,
    clock,
    config: config.matching,
  });
  const batch = new BatchDispatcher({ registry: drivers, trips, config: config.matching });
  const payouts = new PayoutService({ bus, clock, ids, config: config.payouts, trips });
  const ratings = new RatingService({ trips, bus, clock, ids });

  const services: FleetServices = {
    config, clock, rng, ids, bus, logger, eventLog, auth, drivers, riders, promos, surge, quotes, trips, dispatcher, batch, payouts, ratings,
  };

  const router = new Router();
  registerRoutes(router, services);
  const api = new ApiServer(router, auth, logger);
  const adminToken = auth.issue({ role: "admin", id: "ops" });

  return {
    ...services,
    api,
    adminToken,
    call(method, path, token, body, query) {
      const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
      return api.handle({ method, path, headers, body, query });
    },
  };
}
