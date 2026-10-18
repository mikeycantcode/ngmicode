import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export const PASS_SCORE = 70;

export interface SlugProgress {
  best: number | null;
  attempts: number;
  solved: boolean;
  lastAttemptId: string;
}

export async function getProgress(userId: string): Promise<Record<string, SlugProgress>> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.attempts.id, slug: schema.attempts.slug, score: schema.attempts.score, status: schema.attempts.status })
    .from(schema.attempts)
    .where(eq(schema.attempts.userId, userId))
    .orderBy(desc(schema.attempts.startedAt));
  const out: Record<string, SlugProgress> = {};
  for (const r of rows) {
    const p = (out[r.slug] ??= { best: null, attempts: 0, solved: false, lastAttemptId: r.id });
    p.attempts++;
    if (r.score != null) {
      p.best = Math.max(p.best ?? 0, r.score);
      if (r.score >= PASS_SCORE) p.solved = true;
    }
  }
  return out;
}
