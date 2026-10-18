import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getOwnedAttempt, problemForAttempt } from "@/lib/attempts";

/** Hidden tests are released only at submit time, for the client-side runner. */
export async function GET(_req: Request, ctx: RouteContext<"/api/attempts/[id]/hidden">) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const attempt = await getOwnedAttempt(id, user.id);
  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (attempt.status !== "active") return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  const problem = problemForAttempt(attempt.slug);
  if (!problem) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ files: problem.hidden });
}
