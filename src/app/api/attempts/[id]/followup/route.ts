import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getOwnedAttempt, problemForAttempt } from "@/lib/attempts";
import { chatStream, recordUsage } from "@/lib/openrouter";
import { interviewerSystemPrompt } from "@/lib/agent/prompts";
import { MODELS } from "@/lib/taxonomy";
import type { StoredReport } from "@/lib/grading";

export const maxDuration = 120;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request, ctx: RouteContext<"/api/attempts/[id]/followup">) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const attempt = await getOwnedAttempt(id, user.id);
  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (attempt.status !== "followup") return NextResponse.json({ error: "Follow-up is closed" }, { status: 409 });
  const problem = problemForAttempt(attempt.slug);
  if (!problem) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { content } = (await req.json().catch(() => ({}))) as { content?: string };
  if (!content?.trim()) return NextResponse.json({ error: "Empty answer" }, { status: 400 });

  const history = ((attempt.followup as Msg[]) ?? []).concat({ role: "user", content: content.slice(0, 8000) });
  if (history.filter((m) => m.role === "user").length > 8) {
    return NextResponse.json({ error: "Follow-up limit reached — finish the interview." }, { status: 409 });
  }
  const report = attempt.report as StoredReport;
  const submission = attempt.submission as { diff: string } | null;
  const context = `# Task\n${problem.prompt}\n\n# Rubric (private)\n${problem.rubric}\n\n# Grader report (private)\n${JSON.stringify(
    { summary: report.summary, traps: report.traps, improvements: report.improvements, planned_followups: report.followups },
    null,
    1,
  )}\n\n# Candidate diff\n\`\`\`diff\n${(submission?.diff ?? "").slice(0, 20000)}\n\`\`\``;

  const upstream = await chatStream({
    model: MODELS.strong,
    temperature: 0.4,
    max_tokens: 800,
    messages: [{ role: "system", content: interviewerSystemPrompt(context) }, ...history],
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Interviewer unavailable (${upstream.status})` }, { status: 502 });
  }

  const decoder = new TextDecoder();
  let buf = "";
  let reply = "";
  let tokens = 0;
  const encoder = new TextEncoder();
  const stream = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        buf += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:") || line === "data: [DONE]") continue;
          try {
            const j = JSON.parse(line.slice(5));
            if (j.usage?.total_tokens) tokens = j.usage.total_tokens;
            const d = j.choices?.[0]?.delta?.content;
            if (d) {
              reply += d;
              ctrl.enqueue(encoder.encode(d));
            }
          } catch {}
        }
      },
      async flush() {
        const db = await getDb();
        await db
          .update(schema.attempts)
          .set({ followup: [...history, { role: "assistant", content: reply }] })
          .where(eq(schema.attempts.id, id));
        if (tokens) await recordUsage(user.id, id, tokens).catch(() => {});
      },
    }),
  );
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });
}
