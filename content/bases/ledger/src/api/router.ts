import type { Logger } from "../lib/log";
import type { Services } from "../services";
import { ApiKeyStore, authenticate, Principal, requireScope, Scope } from "./auth";
import { ApiRequest, ApiResponse, errorResponse, HttpMethod, json } from "./http";

export interface HandlerContext {
  services: Services;
  req: ApiRequest;
  params: Record<string, string>;
  query: Record<string, string>;
  principal: Principal;
}

export type Handler = (c: HandlerContext) => ApiResponse;

export interface Route {
  method: HttpMethod;
  /** e.g. "/accounts/:id/balance" */
  pattern: string;
  scope: Scope;
  handler: Handler;
}

function splitPath(path: string): { segments: string[]; query: Record<string, string> } {
  const [p, qs] = path.split("?", 2);
  const query: Record<string, string> = {};
  if (qs) {
    for (const pair of qs.split("&")) {
      if (!pair) continue;
      const [k, v = ""] = pair.split("=", 2);
      query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
    }
  }
  return { segments: p.split("/").filter(Boolean), query };
}

function match(pattern: string, segments: string[]): Record<string, string> | null {
  const parts = pattern.split("/").filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
    else if (parts[i] !== segments[i]) return null;
  }
  return params;
}

export function createRouter(routes: Route[], services: Services, keys: ApiKeyStore, log?: Logger) {
  return function handle(req: ApiRequest): ApiResponse {
    try {
      const principal = authenticate(keys, req);
      const { segments, query } = splitPath(req.path);
      let pathMatched = false;
      for (const route of routes) {
        const params = match(route.pattern, segments);
        if (!params) continue;
        pathMatched = true;
        if (route.method !== req.method) continue;
        requireScope(principal, route.scope);
        return route.handler({ services, req, params, query: { ...query, ...(req.query ?? {}) }, principal });
      }
      return pathMatched
        ? json(405, { error: { code: "method_not_allowed", message: `${req.method} not allowed` } })
        : json(404, { error: { code: "not_found", message: `no route for ${req.method} ${req.path}` } });
    } catch (e) {
      return errorResponse(e, log);
    }
  };
}
