import { UnauthorizedError } from "../shared/errors";

export type Role = "rider" | "driver" | "admin";

export interface Principal {
  role: Role;
  /** rider id, driver id, or an admin username */
  id: string;
}

/**
 * Opaque bearer tokens. In production these are issued by the auth service;
 * here we keep an in-memory table so the API layer is testable end to end.
 */
export class TokenAuth {
  private readonly tokens = new Map<string, Principal>();
  private counter = 0;

  issue(principal: Principal): string {
    const token = `tok_${(++this.counter).toString(36).padStart(4, "0")}_${principal.role}`;
    this.tokens.set(token, { ...principal });
    return token;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  /** Parses "Bearer <token>". Returns null when no header is present. */
  authenticate(header: string | undefined): Principal | null {
    if (!header) return null;
    const m = /^Bearer\s+(\S+)$/.exec(header);
    if (!m) throw new UnauthorizedError("malformed authorization header");
    const p = this.tokens.get(m[1]);
    if (!p) throw new UnauthorizedError("unknown token");
    return p;
  }
}
