import { hashPassword, normalizeEmail, verifyPassword, type Customer, type Role } from "../domain/customer";
import { isKnownRegion } from "../pricing/tax";
import type { CustomerRepository } from "../repo/stores";
import type { Clock } from "../shared/clock";
import { AuthError, ConflictError, ValidationError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import type { IdGenerator } from "../shared/ids";
import { SESSION_TTL_MS } from "../config";

export interface Session {
  token: string;
  customerId: string;
  expiresAt: number;
}

export class SessionStore {
  private sessions = new Map<string, Session>();

  constructor(private clock: Clock, private ids: IdGenerator) {}

  issue(customerId: string): Session {
    const session = { token: this.ids.next("sess"), customerId, expiresAt: this.clock.now() + SESSION_TTL_MS };
    this.sessions.set(session.token, session);
    return { ...session };
  }

  /** Returns the session if the token is known and unexpired. */
  resolve(token: string): Session | null {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expiresAt <= this.clock.now()) {
      this.sessions.delete(token);
      return null;
    }
    return { ...s };
  }

  revoke(token: string): void {
    this.sessions.delete(token);
  }
}

interface Deps {
  clock: Clock;
  ids: IdGenerator;
  events: EventBus;
  customers: CustomerRepository;
  sessions: SessionStore;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  region: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AccountService {
  constructor(private deps: Deps) {}

  /** Public sign-up. Always creates a plain customer. */
  register(input: RegisterInput): Customer {
    return this.create(input, "customer");
  }

  /** Internal only (seed scripts, ops tooling) — never exposed over HTTP. */
  createAdmin(input: RegisterInput): Customer {
    return this.create(input, "admin");
  }

  login(email: string, password: string): Session {
    const customer = this.deps.customers.findByEmail(email);
    // same error for unknown email and bad password — don't leak which accounts exist
    if (!customer || !verifyPassword(password, customer.passwordHash)) throw new AuthError("invalid email or password");
    return this.deps.sessions.issue(customer.id);
  }

  private create(input: RegisterInput, role: Role): Customer {
    const errors: string[] = [];
    if (typeof input.email !== "string" || !EMAIL_RE.test(input.email)) errors.push("email is invalid");
    if (typeof input.password !== "string" || input.password.length < 8) errors.push("password must be at least 8 characters");
    if (typeof input.name !== "string" || !input.name.trim()) errors.push("name is required");
    if (typeof input.region !== "string" || !isKnownRegion(input.region)) errors.push("region is not supported");
    if (errors.length) throw new ValidationError("invalid registration", errors);

    const email = normalizeEmail(input.email);
    if (this.deps.customers.findByEmail(email)) throw new ConflictError("email already registered");
    const id = this.deps.ids.next("cus");
    const customer: Customer = {
      id,
      email,
      name: input.name.trim(),
      role,
      region: input.region,
      passwordHash: hashPassword(input.password, id),
      createdAt: this.deps.clock.now(),
    };
    this.deps.customers.save(customer);
    this.deps.events.emit({ type: "customer.registered", customerId: id });
    return customer;
  }
}
