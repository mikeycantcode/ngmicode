import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const SCHEMA_SQL = `
create extension if not exists pgcrypto;
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  slug text not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer,
  verdict text,
  hidden_passed integer,
  hidden_total integer,
  report jsonb,
  followup jsonb,
  submission jsonb,
  tokens integer not null default 0
);
create index if not exists attempts_user_idx on attempts(user_id, slug);
alter table users add column if not exists google_sub text unique;
alter table users add column if not exists avatar_url text;
alter table users alter column password_hash drop not null;
create table if not exists usage (
  user_id uuid not null references users(id) on delete cascade,
  day text not null,
  tokens integer not null default 0,
  requests integer not null default 0,
  primary key (user_id, day)
);
`;

type DB = ReturnType<typeof drizzle<typeof schema>>;

const g = globalThis as unknown as { __steerSql?: postgres.Sql; __steerDb?: DB; __steerReady?: Promise<void> };

function client() {
  if (!g.__steerSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__steerSql = postgres(url, { max: 10, onnotice: () => {} });
    g.__steerDb = drizzle(g.__steerSql, { schema });
  }
  return { sql: g.__steerSql, db: g.__steerDb! };
}

/** Returns the drizzle client, creating tables on first use. */
export async function getDb(): Promise<DB> {
  const { sql, db } = client();
  if (!g.__steerReady) {
    g.__steerReady = sql.unsafe(SCHEMA_SQL).then(() => undefined);
    g.__steerReady.catch(() => (g.__steerReady = undefined));
  }
  await g.__steerReady;
  return db;
}

export { schema };
