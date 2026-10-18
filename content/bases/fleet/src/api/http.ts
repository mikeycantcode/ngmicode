import { FleetError, ForbiddenError, isFleetError, UnauthorizedError } from "../shared/errors";
import type { Logger } from "../shared/logger";
import { NOOP_LOGGER } from "../shared/logger";
import type { Principal, Role, TokenAuth } from "./auth";

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface ApiRequest {
  method: Method;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface HandlerContext {
  req: ApiRequest;
  params: Record<string, string>;
  /** Non-null for every route that isn't `public`. */
  principal: Principal;
}

export type Handler = (ctx: HandlerContext) => unknown | Promise<unknown>;

export interface RouteOptions {
  /** Roles allowed to call this route, or "public". */
  roles: Role[] | "public";
  /** Status for a successful response (default 200). */
  status?: number;
}

interface Route {
  method: Method;
  segments: string[];
  handler: Handler;
  opts: RouteOptions;
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: Method, pattern: string, opts: RouteOptions, handler: Handler): this {
    this.routes.push({ method, segments: pattern.split("/").filter(Boolean), handler, opts });
    return this;
  }

  match(method: Method, path: string): { route: Route; params: Record<string, string> } | null {
    const parts = path.split("?")[0].split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }
}

/** Tiny HTTP-shaped facade. No sockets — tests call `handle` directly. */
export class ApiServer {
  constructor(
    private readonly router: Router,
    private readonly auth: TokenAuth,
    private readonly logger: Logger = NOOP_LOGGER,
  ) {}

  async handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      const m = this.router.match(req.method, req.path);
      if (!m) return { status: 404, body: { error: { code: "route_not_found", message: `${req.method} ${req.path}` } } };
      const principal = this.auth.authenticate(req.headers?.authorization);
      if (m.route.opts.roles !== "public") {
        if (!principal) throw new UnauthorizedError();
        if (!m.route.opts.roles.includes(principal.role)) throw new ForbiddenError(`role ${principal.role} cannot call this route`);
      }
      const body = await m.route.handler({ req, params: m.params, principal: principal as Principal });
      return { status: m.route.opts.status ?? 200, body };
    } catch (e) {
      return this.toErrorResponse(e, req);
    }
  }

  private toErrorResponse(e: unknown, req: ApiRequest): ApiResponse {
    if (isFleetError(e)) {
      const fe = e as FleetError;
      return { status: fe.status, body: { error: { code: fe.code, message: fe.message } } };
    }
    this.logger.error("unhandled error", { path: req.path, err: String(e) });
    return { status: 500, body: { error: { code: "internal", message: "internal error" } } };
  }
}
