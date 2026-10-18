import { NotFoundError } from "../shared/errors";
import type { Handler, HttpMethod, Middleware, Next, RawRequest, Request, Response } from "./types";

interface Route {
  method: HttpMethod;
  pattern: string;
  segments: string[];
  stack: Middleware[];
  handler: Handler;
}

type Stack = [...Middleware[], Handler];

/**
 * Minimal router. Global middleware (use()) wraps everything, including the
 * 404/405 responses, so the error mapper sees every failure. Route-level
 * middleware runs after global middleware, in the order given.
 */
export class Router {
  private routes: Route[] = [];
  private global: Middleware[] = [];

  use(mw: Middleware): this {
    this.global.push(mw);
    return this;
  }

  get(pattern: string, ...stack: Stack) {
    return this.add("GET", pattern, stack);
  }
  post(pattern: string, ...stack: Stack) {
    return this.add("POST", pattern, stack);
  }
  put(pattern: string, ...stack: Stack) {
    return this.add("PUT", pattern, stack);
  }
  patch(pattern: string, ...stack: Stack) {
    return this.add("PATCH", pattern, stack);
  }
  delete(pattern: string, ...stack: Stack) {
    return this.add("DELETE", pattern, stack);
  }

  /** For debugging / the admin "routes" page. */
  describe(): string[] {
    return this.routes.map((r) => `${r.method} ${r.pattern}`);
  }

  async handle(raw: RawRequest): Promise<Response> {
    const [path, qs = ""] = raw.url.split("?", 2);
    const req: Request = {
      method: raw.method,
      path,
      params: {},
      query: parseQuery(qs),
      headers: lowerKeys(raw.headers ?? {}),
      body: raw.body,
      user: null,
    };
    const dispatch: Next = async () => {
      const match = this.match(req.method, path);
      if (!match) throw new NotFoundError(`no route for ${req.method} ${path}`);
      if (match === "method_not_allowed") return { status: 405, body: { error: { code: "method_not_allowed", message: `${req.method} not allowed on ${path}` } } };
      req.params = match.params;
      return run(match.route.stack, req, async () => match.route.handler(req));
    };
    return run(this.global, req, dispatch);
  }

  private add(method: HttpMethod, pattern: string, stack: Stack): this {
    const handler = stack[stack.length - 1] as Handler;
    const middleware = stack.slice(0, -1) as Middleware[];
    this.routes.push({ method, pattern, segments: split(pattern), stack: middleware, handler });
    return this;
  }

  private match(method: HttpMethod, path: string): { route: Route; params: Record<string, string> } | "method_not_allowed" | null {
    const parts = split(path);
    let pathMatched = false;
    for (const route of this.routes) {
      const params = matchSegments(route.segments, parts);
      if (!params) continue;
      if (route.method === method) return { route, params };
      pathMatched = true;
    }
    return pathMatched ? "method_not_allowed" : null;
  }
}

function run(stack: Middleware[], req: Request, last: Next): Promise<Response> {
  const step = (i: number): Promise<Response> => (i === stack.length ? last() : stack[i](req, () => step(i + 1)));
  return step(0);
}

function split(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matchSegments(pattern: string[], parts: string[]): Record<string, string> | null {
  if (pattern.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i];
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]);
    else if (seg !== parts[i]) return null;
  }
  return params;
}

function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=", 2);
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  return out;
}

function lowerKeys(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}
