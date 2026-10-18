import { ConflictError, ValidationError } from "../domain/errors";
import { toIso } from "../lib/time";
import type { ServiceContext } from "./index";

/**
 * Period close: once a tenant's books are closed through T, no entry with
 * postedAt <= T may be written for that tenant by ANY path (post, import).
 * Corrections go into the open period (reversals are posted now).
 */
export class PeriodService {
  constructor(private readonly ctx: ServiceContext) {}

  close(tenantId: string, through: number): number {
    if (!Number.isSafeInteger(through)) throw new ValidationError("through must be epoch milliseconds", { field: "through" });
    if (through > this.ctx.clock.now()) throw new ValidationError("cannot close a period in the future", { field: "through" });
    const current = this.closedThrough(tenantId);
    if (current !== null && through <= current) {
      throw new ConflictError(`period already closed through ${toIso(current)}`, "period_closed");
    }
    this.ctx.repos.periods.setClosedThrough(tenantId, through);
    this.ctx.bus.publish("period.closed", { through }, tenantId);
    return through;
  }

  closedThrough(tenantId: string): number | null {
    return this.ctx.repos.periods.getClosedThrough(tenantId) ?? null;
  }

  /** Throws ConflictError(period_closed) if postedAt falls in a closed period. */
  assertOpen(tenantId: string, postedAt: number): void {
    const through = this.closedThrough(tenantId);
    if (through !== null && postedAt <= through) {
      throw new ConflictError(`period closed through ${toIso(through)}`, "period_closed", { closedThrough: through });
    }
  }
}
