import type { Clock } from "../shared/clock";
import { ConflictError, NotFoundError, ValidationError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import type { IdGenerator } from "../shared/ids";

export interface Rider {
  id: string;
  name: string;
  /** E.164, e.g. +14155550123 */
  phone: string;
  createdAt: number;
  /** Set by trust & safety. Suspended riders cannot request trips. */
  suspended: boolean;
}

const E164 = /^\+[1-9]\d{6,14}$/;

export function isValidPhone(phone: string): boolean {
  return E164.test(phone);
}

export class RiderService {
  private readonly rows = new Map<string, Rider>();
  private readonly byPhone = new Map<string, string>();

  constructor(private readonly deps: { bus: EventBus; clock: Clock; ids: IdGenerator }) {}

  register(input: { name: string; phone: string }): Rider {
    const name = (input.name ?? "").trim();
    if (!name) throw new ValidationError("name is required");
    if (!isValidPhone(input.phone ?? "")) throw new ValidationError("phone must be E.164");
    if (this.byPhone.has(input.phone)) throw new ConflictError("phone_taken", "phone already registered");
    const rider: Rider = {
      id: this.deps.ids.next("rdr"),
      name,
      phone: input.phone,
      createdAt: this.deps.clock.now(),
      suspended: false,
    };
    this.rows.set(rider.id, rider);
    this.byPhone.set(rider.phone, rider.id);
    this.deps.bus.emit({ type: "rider.registered", at: rider.createdAt, entityId: rider.id, data: {} });
    return rider;
  }

  get(id: string): Rider {
    const r = this.rows.get(id);
    if (!r) throw new NotFoundError("rider", id);
    return r;
  }

  find(id: string): Rider | undefined {
    return this.rows.get(id);
  }

  suspend(id: string): Rider {
    const r = { ...this.get(id), suspended: true };
    this.rows.set(id, r);
    return r;
  }
}
