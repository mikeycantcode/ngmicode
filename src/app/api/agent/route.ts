import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { getOwnedAttempt, modeForTrack, problemForAttempt } from "@/lib/attempts";
import { systemPrompt } from "@/lib/agent/prompts";
import { TOOL_DEFS } from "@/lib/agent/tool-defs";
import { AGENT_LIMITS, type ApiMessage } from "@/lib/agent/types";
import { chatStream, DAILY_TOKEN_LIMIT, recordUsage, tokensUsedToday } from "@/lib/openrouter";
import { MODELS } from "@/lib/taxonomy";

export const maxDuration = 300;

const bodySchema = z.object({
  attemptId: z.string(),
  messages: z.array(z.any()).min(1).max(400),
});

/** Ensures every assistant tool_call has a tool result and drops orphan tool messages. */
function sanitize(messages: ApiMessage[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "tool") continue;
    if (m.role === "assistant" && m.tool_calls?.length) {
      out.push({ role: "assistant", content: m.content ?? "", tool_calls: m.tool_calls });
      const results = new Map<string, ApiMessage>();
      let j = i + 1;
      while (j < messages.length && messages[j].role === "tool") {
        const t = messages[j] as Extract<ApiMessage, { role: "tool" }>;
        results.set(t.tool_call_id, t);
        j++;
      }
      for (const c of m.tool_calls) {
        out.push(results.get(c.id) ?? { role: "tool", tool_call_id: c.id, content: "(cancelled)" });
      }
      i = j - 1;
      continue;
    }
    if (m.role === "assistant") out.push({ role: "assistant", content: m.content ?? "" });
    else out.push({ role: "user", content: String(m.content).slice(0, 20000) });
  }
  return out;
}

/** Keeps only the last n messages, starting on a user message so tool pairs stay intact. */
function trimContext(messages: ApiMessage[], n: number): ApiMessage[] {
  if (!n || messages.length <= n) return messages;
  let start = messages.length - n;
  while (start < messages.length && messages[start].role !== "user") start++;
  if (start >= messages.length) {
    // No user message in the window: keep from the last user message.
    start = messages.map((m) => m.role).lastIndexOf("user");
  }
  return messages.slice(Math.max(0, start));
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use the agent" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const attempt = await getOwnedAttempt(parsed.data.attemptId, user.id);
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  if (attempt.status !== "active") return NextResponse.json({ error: "This attempt was already submitted" }, { status: 409 });

  const problem = problemForAttempt(attempt.slug);
  if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

  const used = await tokensUsedToday(user.id);
  if (used >= DAILY_TOKEN_LIMIT) {
    return NextResponse.json({ error: "Daily agent budget reached. It resets at 00:00 UTC." }, { status: 429 });
  }

  const mode = modeForTrack(problem.track);
  const model = mode === "weak" ? MODELS.weak : MODELS.strong;
  const history = trimContext(sanitize(parsed.data.messages as ApiMessage[]), AGENT_LIMITS[mode].contextMessages);

  const upstream = await chatStream(
    {
      model,
      messages: [{ role: "system", content: systemPrompt(mode, Object.keys(problem.starter).length) }, ...history],
      tools: TOOL_DEFS,
      temperature: mode === "weak" ? 0.7 : 0.2,
      max_tokens: mode === "weak" ? 3000 : 12000,
    },
    req.signal,
  ).catch((e: Error) => e);

  if (upstream instanceof Error) return NextResponse.json({ error: upstream.message }, { status: 502 });
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return NextResponse.json({ error: `Model provider error (${upstream.status}): ${text.slice(0, 300)}` }, { status: 502 });
  }

  // Pass the SSE stream through while sniffing the usage chunk for accounting.
  const decoder = new TextDecoder();
  let tail = "";
  let tokens = 0;
  const tap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      ctrl.enqueue(chunk);
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(-4000);
      const m = tail.match(/"total_tokens"\s*:\s*(\d+)/g);
      if (m) tokens = Number(m[m.length - 1].replace(/\D/g, ""));
    },
    async flush() {
      if (tokens) await recordUsage(user.id, attempt.id, tokens).catch(() => {});
    },
  });

  return new Response(upstream.body.pipeThrough(tap), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
  });
}
