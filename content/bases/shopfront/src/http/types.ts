import type { Role } from "../domain/customer";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface AuthUser {
  id: string;
  role: Role;
}

/** What callers hand to Router.handle(). `url` may include a query string. */
export interface RawRequest {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface Request {
  method: HttpMethod;
  path: string;
  /** Route params, e.g. { id } for /orders/:id. URL-decoded. */
  params: Record<string, string>;
  /** Query string values (last one wins for repeated keys). */
  query: Record<string, string>;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  body: unknown;
  /** Set by the authenticate middleware; null for anonymous requests. */
  user: AuthUser | null;
}

export interface Response {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type Next = () => Promise<Response>;
export type Middleware = (req: Request, next: Next) => Promise<Response>;
export type Handler = (req: Request) => Response | Promise<Response>;

export const json = (status: number, body: unknown): Response => ({ status, body });
export const noContent = (): Response => ({ status: 204 });
