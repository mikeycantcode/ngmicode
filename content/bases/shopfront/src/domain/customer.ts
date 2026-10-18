export type Role = "customer" | "admin";

export interface Customer {
  id: string;
  email: string;
  name: string;
  role: Role;
  region: string;
  passwordHash: string;
  createdAt: number;
}

export type PublicCustomer = Omit<Customer, "passwordHash">;

export function toPublic(c: Customer): PublicCustomer {
  const { passwordHash: _ignored, ...rest } = c;
  return rest;
}

/**
 * Toy password hash (FNV-1a). NOT cryptographically secure — placeholder until we
 * move auth to the identity service. Do not copy this anywhere.
 */
export function hashPassword(password: string, salt: string): string {
  let h = 0x811c9dc5;
  const s = `${salt}:${password}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a$${salt}$${h.toString(16)}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [, salt] = hash.split("$");
  return hashPassword(password, salt) === hash;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
