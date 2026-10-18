"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export interface AuthState {
  error?: string;
  fields?: Record<string, string>;
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// Simple in-memory limiter: 10 auth attempts per IP per 10 minutes.
const hits = new Map<string, number[]>();
async function rateLimited() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/problems";
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const fields = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  if (await rateLimited()) return { error: "Too many attempts. Try again in a few minutes.", fields };
  const parsed = signupSchema.safeParse({ ...fields, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const db = await getDb();
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, parsed.data.email));
  if (existing.length) return { error: "An account with that email already exists", fields };
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [u] = await db
    .insert(schema.users)
    .values({ name: parsed.data.name, email: parsed.data.email, passwordHash })
    .returning();
  await createSession({ id: u.id, name: u.name, email: u.email });
  redirect(safeNext(form.get("next")));
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (await rateLimited()) return { error: "Too many attempts. Try again in a few minutes.", fields: { email } };
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!u || !u.passwordHash || !(await bcrypt.compare(password, u.passwordHash))) {
    if (u && !u.passwordHash) return { error: "This account uses Google sign-in. Continue with Google instead.", fields: { email } };
    return { error: "Invalid email or password", fields: { email } };
  }
  await createSession({ id: u.id, name: u.name, email: u.email });
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}
