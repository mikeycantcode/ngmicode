import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getProblem } from "./problems";
import { TRACKS } from "./taxonomy";
import type { AgentMode } from "./agent/types";

export async function getOwnedAttempt(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [a] = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.id, id), eq(schema.attempts.userId, userId)));
  return a ?? null;
}

export function modeForTrack(track: keyof typeof TRACKS): AgentMode {
  return TRACKS[track].agent;
}

export function problemForAttempt(slug: string) {
  return getProblem(slug);
}

/** Elapsed seconds plus a 2-minute grace period. */
export function isOverTime(startedAt: Date, timeLimitMin: number) {
  return (Date.now() - startedAt.getTime()) / 1000 > timeLimitMin * 60 + 120;
}
