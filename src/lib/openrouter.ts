import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "./db";

const URL = "https://openrouter.ai/api/v1/chat/completions";

export function openrouterHeaders() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured on the server");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_URL || "https://steercode.app",
    "X-Title": "SteerCode",
  };
}

export async function chatStream(body: Record<string, unknown>, signal?: AbortSignal) {
  return fetch(URL, {
    method: "POST",
    headers: openrouterHeaders(),
    body: JSON.stringify({ ...body, stream: true, usage: { include: true } }),
    signal,
  });
}

/** Non-streaming JSON completion with one retry on parse failure. */
export async function chatJSON<T>(body: Record<string, unknown>, parse: (x: unknown) => T): Promise<{ data: T; tokens: number }> {
  let lastErr: unknown;
  let tokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: openrouterHeaders(),
      body: JSON.stringify({ ...body, response_format: { type: "json_object" }, usage: { include: true } }),
    });
    if (!res.ok) {
      lastErr = new Error(`Grader request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      continue;
    }
    const json = await res.json();
    tokens += json.usage?.total_tokens ?? 0;
    const text: string = json.choices?.[0]?.message?.content ?? "";
    try {
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      return { data: parse(JSON.parse(cleaned)), tokens };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Grader returned invalid JSON");
}

export const DAILY_TOKEN_LIMIT = Number(process.env.DAILY_TOKEN_LIMIT || 3_000_000);

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function tokensUsedToday(userId: string) {
  const db = await getDb();
  const rows = await db.execute(sql`select tokens from usage where user_id = ${userId} and day = ${today()}`);
  return Number((rows[0] as { tokens?: number } | undefined)?.tokens ?? 0);
}

export async function recordUsage(userId: string, attemptId: string | null, tokens: number) {
  const db = await getDb();
  await db
    .insert(schema.usage)
    .values({ userId, day: today(), tokens, requests: 1 })
    .onConflictDoUpdate({
      target: [schema.usage.userId, schema.usage.day],
      set: { tokens: sql`${schema.usage.tokens} + ${tokens}`, requests: sql`${schema.usage.requests} + 1` },
    });
  if (attemptId) {
    await db.execute(sql`update attempts set tokens = tokens + ${tokens} where id = ${attemptId}`);
  }
}
