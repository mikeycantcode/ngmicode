import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getOwnedAttempt, problemForAttempt } from "@/lib/attempts";
import { chatJSON, recordUsage } from "@/lib/openrouter";
import { finalizerSystemPrompt } from "@/lib/agent/prompts";
import { finalSchema, followupAdjustment, verdictFor, type StoredReport } from "@/lib/grading";
import { MODELS } from "@/lib/taxonomy";

export const maxDuration = 120;

export async function POST(_req: Request, ctx: RouteContext<"/api/attempts/[id]/finalize">) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const attempt = await getOwnedAttempt(id, user.id);
  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (attempt.status !== "followup") return NextResponse.json({ error: "Already finalized" }, { status: 409 });
  const problem = problemForAttempt(attempt.slug);
  if (!problem) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const report = attempt.report as StoredReport;
  const followup = (attempt.followup as { role: string; content: string }[]) ?? [];
  const answered = followup.some((m) => m.role === "user");
  const db = await getDb();

  let final: StoredReport["final"];
  if (!answered) {
    final = { followup_score: 1, followup_evidence: "The candidate skipped the follow-up discussion.", final_summary: report.summary, adjustment: followupAdjustment(1) };
  } else {
    const transcript = followup.map((m) => `${m.role === "user" ? "CANDIDATE" : "INTERVIEWER"}: ${m.content}`).join("\n\n");
    try {
      const { data, tokens } = await chatJSON(
        {
          model: MODELS.grader,
          temperature: 0.1,
          max_tokens: 1500,
          messages: [
            { role: "system", content: finalizerSystemPrompt() },
            {
              role: "user",
              content: `# Task\n${problem.prompt}\n\n# Initial report\n${JSON.stringify({ summary: report.summary, dimensions: report.dimensions, traps: report.traps })}\n\n# Follow-up transcript\n${transcript}`,
            },
          ],
        },
        (x) => finalSchema.parse(x),
      );
      await recordUsage(user.id, id, tokens).catch(() => {});
      final = { ...data, adjustment: followupAdjustment(data.followup_score) };
    } catch (e) {
      return NextResponse.json({ error: `Finalizing failed: ${(e as Error).message}` }, { status: 502 });
    }
  }

  const score = Math.max(0, Math.min(100, report.baseScore + final.adjustment));
  await db
    .update(schema.attempts)
    .set({ status: "complete", score, verdict: verdictFor(score), report: { ...report, final } })
    .where(and(eq(schema.attempts.id, id), eq(schema.attempts.status, "followup")));
  return NextResponse.json({ ok: true, score });
}
