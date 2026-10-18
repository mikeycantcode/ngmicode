import { AccountService } from "./accounts/account-service";
import { SessionStore } from "./accounts/account-service";
import { CartService } from "./cart/cart-service";
import { CatalogService } from "./catalog/catalog-service";
import { CheckoutService } from "./checkout/checkout-service";
import { OrderService } from "./checkout/order-service";
import { FakePaymentGateway } from "./checkout/payments";
import { authenticate, errorMapper } from "./http/middleware";
import { Router } from "./http/router";
import { registerAccountRoutes } from "./http/routes/accounts";
import { registerAdminRoutes } from "./http/routes/admin";
import { registerCartRoutes } from "./http/routes/cart";
import { registerOrderRoutes } from "./http/routes/orders";
import { registerProductRoutes } from "./http/routes/products";
import type { HttpMethod, Response } from "./http/types";
import { InventoryService } from "./inventory/inventory-service";
import { PricingEngine } from "./pricing/engine";
import { CartRepository } from "./repo/stores";
import { CustomerRepository } from "./repo/stores";
import { OrderRepository } from "./repo/stores";
import { CouponRepository, PromotionRepository } from "./repo/pricing";
import { ProductRepository } from "./repo/products";
import { manualClock, type Clock } from "./shared/clock";
import { EventBus } from "./shared/events";
import { createIdGenerator } from "./shared/ids";

export interface Repos {
  products: ProductRepository;
  customers: CustomerRepository;
  carts: CartRepository;
  orders: OrderRepository;
  coupons: CouponRepository;
  promotions: PromotionRepository;
}

/** Everything a route handler may need. Built once in app.ts. */
export interface Services {
  clock: Clock;
  ids: IdGenerator;
  events: EventBus;
  repos: Repos;
  sessions: SessionStore;
  accounts: AccountService;
  catalog: CatalogService;
  inventory: InventoryService;
  pricing: PricingEngine;
  carts: CartService;
  checkout: CheckoutService;
  orders: OrderService;
  payments: FakePaymentGateway;
}

export interface AppOptions {
  clock?: Clock;
  /** Called for non-AppError exceptions caught by the error mapper. */
  onUnexpectedError?: (e: unknown) => void;
}

export interface RequestOptions {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Composition root: wires repositories, services and HTTP routes. */
export function createApp(opts: AppOptions = {}) {
  const clock = opts.clock ?? manualClock();
  const ids = createIdGenerator();
  const events = new EventBus(clock);

  const repos: Repos = {
    products: new ProductRepository(),
    customers: new CustomerRepository(),
    carts: new CartRepository(),
    orders: new OrderRepository(),
    coupons: new CouponRepository(),
    promotions: new PromotionRepository(),
  };

  const sessions = new SessionStore(clock, ids);
  const inventory = new InventoryService({ clock, events, ids });
  const pricing = new PricingEngine({ clock, products: repos.products, coupons: repos.coupons, promotions: repos.promotions });
  const carts = new CartService({ clock, ids, carts: repos.carts, products: repos.products, coupons: repos.coupons, pricing });
  const payments = new FakePaymentGateway(ids);

  const services: Services = {
    clock,
    ids,
    events,
    repos,
    sessions,
    inventory,
    pricing,
    carts,
    payments,
    accounts: new AccountService({ clock, ids, events, customers: repos.customers, sessions }),
    catalog: new CatalogService({ clock, events, ids, products: repos.products }),
    checkout: new CheckoutService({
      clock,
      ids,
      events,
      customers: repos.customers,
      orders: repos.orders,
      coupons: repos.coupons,
      carts,
      inventory,
      pricing,
    }),
    orders: new OrderService({ clock, events, orders: repos.orders, inventory, payments }),
  };

  const router = new Router();
  router.use(errorMapper(opts.onUnexpectedError));
  router.use(authenticate(sessions, repos.customers));
  registerAccountRoutes(router, services);
  registerProductRoutes(router, services);
  registerCartRoutes(router, services);
  registerOrderRoutes(router, services);
  registerAdminRoutes(router, services);

  /** Convenience wrapper used by tests and the dev console. */
  function request(method: HttpMethod, url: string, o: RequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.token) headers["authorization"] = `Bearer ${o.token}`;
    return router.handle({ method, url, headers, body: o.body });
  }

  return { ...services, router, request };
}

export type App = ReturnType<typeof createApp>;
