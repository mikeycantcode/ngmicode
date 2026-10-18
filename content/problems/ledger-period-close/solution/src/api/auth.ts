import { ForbiddenError, UnauthorizedError } from "../domain/errors";
import { ApiRequest, header } from "./http";

export type Scope =
  | "accounts:read"
  | "accounts:write"
  | "journal:write"
  | "payments:read"
  | "payments:write"
  | "reports:read"
  | "fx:write"
  | "audit:read"
  | "periods:write";

export const ALL_SCOPES: Scope[] = [
  "accounts:read",
  "accounts:write",
  "journal:write",
  "payments:read",
  "payments:write",
  "reports:read",
  "fx:write",
  "audit:read",
  "periods:write",
];

export const READ_ONLY_SCOPES: Scope[] = ["accounts:read", "payments:read", "reports:read"];

/** Who is calling. Every API key belongs to exactly one tenant. */
export interface Principal {
  keyId: string;
  tenantId: string;
  scopes: Scope[];
}

export class ApiKeyStore {
  private keys = new Map<string, Principal>();

  register(secret: string, p: { tenantId: string; scopes: Scope[] }): Principal {
    const principal: Principal = { keyId: `key_${this.keys.size + 1}`, tenantId: p.tenantId, scopes: [...p.scopes] };
    this.keys.set(secret, principal);
    return principal;
  }

  revoke(secret: string): void {
    this.keys.delete(secret);
  }

  resolve(secret: string): Principal | undefined {
    const p = this.keys.get(secret);
    return p ? { ...p, scopes: [...p.scopes] } : undefined;
  }
}

/** Expects `Authorization: Bearer <secret>`. */
export function authenticate(store: ApiKeyStore, req: ApiRequest): Principal {
  const raw = header(req, "authorization");
  const m = raw ? /^Bearer\s+(\S+)$/.exec(raw) : null;
  if (!m) throw new UnauthorizedError();
  const principal = store.resolve(m[1]);
  if (!principal) throw new UnauthorizedError();
  return principal;
}

export function requireScope(principal: Principal, scope: Scope): void {
  if (!principal.scopes.includes(scope)) throw new ForbiddenError(`API key lacks scope ${scope}`);
}
