import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getProblem } from "@/lib/problems";
import { isOverTime } from "@/lib/attempts";

/** Starts (or resumes) an attempt for a problem. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug, fresh } = (await req.json().catch(() => ({}))) as { slug?: string; fresh?: boolean };
  const problem = slug ? getProblem(slug) : null;
  if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

  const db = await getDb();
  const [active] = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.userId, user.id), eq(schema.attempts.slug, problem.slug), eq(schema.attempts.status, "active")))
    .orderBy(desc(schema.attempts.startedAt))
    .limit(1);

  if (active && !fresh && !isOverTime(active.startedAt, problem.timeLimit)) {
    return NextResponse.json({ id: active.id, startedAt: active.startedAt.toISOString(), resumed: true });
  }
  if (active) {
    await db.update(schema.attempts).set({ status: "abandoned" }).where(eq(schema.attempts.id, active.id));
  }
  const [a] = await db.insert(schema.attempts).values({ userId: user.id, slug: problem.slug }).returning();
  return NextResponse.json({ id: a.id, startedAt: a.startedAt.toISOString(), resumed: false });
}
