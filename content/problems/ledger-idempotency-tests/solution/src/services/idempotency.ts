import { ConflictError } from "../domain/errors";
import { stableStringify } from "../lib/objects";
import type { ServiceContext } from "./index";

export interface IdempotentResult<T> {
  value: T;
  /** True when the value came from a previous call with the same key. */
  replayed: boolean;
}

/**
 * Idempotency keys for unsafe operations (payments, refunds, entries).
 *
 * Contract:
 *  - Keys are scoped (the api layer uses the tenant id), so two tenants can
 *    use the same key independently.
 *  - Same scope+key and same request fingerprint -> the stored result is
 *    returned and `fn` is NOT run again.
 *  - Same scope+key with a different request -> ConflictError(idempotency_mismatch).
 *  - While the first call is running -> ConflictError(idempotency_in_progress).
 *  - If `fn` throws, the key is released so the client can retry.
 *  - Records expire after config.idempotencyTtlMs.
 */
export class IdempotencyService {
  constructor(private readonly ctx: ServiceContext) {}

  run<T>(scope: string, key: string, request: unknown, fn: () => T): IdempotentResult<T> {
    const id = `${scope}:${key}`;
    const fingerprint = stableStringify(request);
    const now = this.ctx.clock.now();
    const repo = this.ctx.repos.idempotency;

    const existing = repo.get(id);
    if (existing && now - existing.createdAt < this.ctx.config.idempotencyTtlMs) {
      if (existing.fingerprint !== fingerprint) {
        throw new ConflictError(`idempotency key ${key} was used with a different request`, "idempotency_mismatch");
      }
      if (existing.state === "in_progress") {
        throw new ConflictError(`a request with idempotency key ${key} is still in progress`, "idempotency_in_progress");
      }
      return { value: existing.response as T, replayed: true };
    }

    repo.put({ id, fingerprint, state: "in_progress", createdAt: now });
    let value: T;
    try {
      value = fn();
    } catch (e) {
      repo.delete(id);
      throw e;
    }
    repo.put({ id, fingerprint, state: "completed", response: value, createdAt: now });
    return { value, replayed: false };
  }
}
