import { accountRoutes } from "./api/handlers/accounts";
import { journalRoutes } from "./api/handlers/journal";
import { paymentRoutes } from "./api/handlers/payments";
import { periodRoutes } from "./api/handlers/periods";
import { reportRoutes } from "./api/handlers/reports";
import { createRouter, Route } from "./api/router";
import { ApiKeyStore } from "./api/auth";
import type { ApiRequest, ApiResponse } from "./api/http";
import { DEFAULT_CONFIG, LedgerConfig } from "./config";
import { Clock, IdGenerator, sequentialIds, systemClock } from "./lib/clock";
import { EventBus } from "./lib/events";
import { Logger, silentLogger } from "./lib/log";
import { createServices, Services } from "./services";
import type { ServiceContext } from "./services";
import { createRepos } from "./storage/repos";

export const ROUTES: Route[] = [...accountRoutes, ...journalRoutes, ...paymentRoutes, ...reportRoutes, ...periodRoutes];

export interface LedgerAppOptions {
  clock?: Clock;
  ids?: IdGenerator;
  config?: Partial<LedgerConfig>;
  log?: Logger;
}

export interface LedgerApp {
  ctx: ServiceContext;
  services: Services;
  apiKeys: ApiKeyStore;
  /** Entry point used by the HTTP adapter (and by tests). */
  handle(req: ApiRequest): ApiResponse;
}

/** Composition root: wires repos, bus, services and the API router. */
export function createLedgerApp(opts: LedgerAppOptions = {}): LedgerApp {
  const clock = opts.clock ?? systemClock;
  const log = opts.log ?? silentLogger;
  const ctx: ServiceContext = {
    clock,
    ids: opts.ids ?? sequentialIds(),
    bus: new EventBus(
      () => clock.now(),
      (e, event) => log.error("event handler failed", { type: event.type, error: String(e) }),
    ),
    repos: createRepos(),
    config: { ...DEFAULT_CONFIG, ...(opts.config ?? {}) },
    log,
  };
  const services = createServices(ctx);
  const apiKeys = new ApiKeyStore();
  const handle = createRouter(ROUTES, services, apiKeys, log);
  return { ctx, services, apiKeys, handle };
}
