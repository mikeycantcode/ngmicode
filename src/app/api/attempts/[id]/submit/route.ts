import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getOwnedAttempt, problemForAttempt } from "@/lib/attempts";
import { chatJSON, recordUsage } from "@/lib/openrouter";
import { graderSystemPrompt } from "@/lib/agent/prompts";
import {
  buildDiff,
  computeScore,
  graderContext,
  renderTimeline,
  renderTranscript,
  reportSchema,
  verdictFor,
  type StoredReport,
} from "@/lib/grading";
import { MODELS } from "@/lib/taxonomy";
import type { RunResult } from "@/lib/runner/core";
import type { ApiMessage, WorkspaceEvent } from "@/lib/agent/types";

export const maxDuration = 300;

interface SubmitBody {
  files: Record<string, string>;
  hidden: RunResult;
  visible: RunResult | null;
  messages: ApiMessage[];
  events: WorkspaceEvent[];
  notes: string;
}

export async function POST(req: Request, ctx: RouteContext<"/api/attempts/[id]/submit">) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const attempt = await getOwnedAttempt(id, user.id);
  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const problem = problemForAttempt(attempt.slug);
  if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as SubmitBody | null;
  if (!body?.files || !body.hidden) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = await getDb();
  // Claim the attempt atomically so double-submits don't grade twice.
  const claimed = await db
    .update(schema.attempts)
    .set({ status: "grading", submittedAt: new Date() })
    .where(and(eq(schema.attempts.id, id), eq(schema.attempts.status, "active")))
    .returning({ id: schema.attempts.id });
  if (!claimed.length) return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  const submittedAt = new Date();
  const elapsedSec = (submittedAt.getTime() - attempt.startedAt.getTime()) / 1000;
  const files = Object.fromEntries(Object.entries(body.files).filter(([p]) => !p.startsWith("tests/hidden/")));
  const diff = buildDiff(problem.starter, files);
  const hiddenTotal = body.hidden.tests.length;
  const hiddenPassed = body.hidden.tests.filter((t) => t.status === "pass").length;

  try {
    const { data: report, tokens } = await chatJSON(
      {
        model: MODELS.grader,
        temperature: 0.1,
        max_tokens: 6000,
        messages: [
          { role: "system", content: graderSystemPrompt() },
          {
            role: "user",
            content: graderContext({
              problem,
              elapsedSec,
              transcript: renderTranscript(body.messages ?? []),
              timeline: renderTimeline(body.events ?? [], attempt.startedAt),
              notes: String(body.notes ?? "").slice(0, 10000),
              diff,
              hidden: body.hidden,
              visible: body.visible,
            }),
          },
        ],
      },
      (x) => reportSchema.parse(x),
    );
    await recordUsage(user.id, id, tokens).catch(() => {});

    const { score, testRatio, weights } = computeScore(problem.track, report, hiddenPassed, hiddenTotal);
    const stored: StoredReport = { ...report, track: problem.track, testRatio, baseScore: score, weights };
    const changed = Object.fromEntries(Object.entries(files).filter(([p, c]) => problem.starter[p] !== c));
    const deleted = Object.keys(problem.starter).filter((p) => !(p in files));

    await db
      .update(schema.attempts)
      .set({
        status: "followup",
        submittedAt,
        score,
        verdict: verdictFor(score),
        hiddenPassed,
        hiddenTotal,
        report: stored,
        followup: [{ role: "assistant", content: report.followups[0] }],
        submission: {
          changed,
          deleted,
          diff,
          notes: body.notes,
          messages: body.messages,
          events: body.events,
          hidden: body.hidden,
          visible: body.visible,
          elapsedSec,
        },
      })
      .where(eq(schema.attempts.id, id));
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    await db.update(schema.attempts).set({ status: "active", submittedAt: null }).where(eq(schema.attempts.id, id));
    return NextResponse.json({ error: `Grading failed: ${(e as Error).message}. Your work is intact — try submitting again.` }, { status: 502 });
  }
}
