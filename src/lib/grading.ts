import "server-only";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import type { ApiMessage, WorkspaceEvent } from "./agent/types";
import type { ProblemBundle } from "./content-types";
import type { RunResult } from "./runner/core";
import type { TrackId } from "./taxonomy";

export const DIMENSIONS = [
  { id: "decomposition", name: "Decomposition & planning" },
  { id: "steering", name: "Agent steering" },
  { id: "verification", name: "Verification" },
  { id: "code_quality", name: "Code quality" },
  { id: "communication", name: "Communication & precision" },
] as const;

export type DimensionId = (typeof DIMENSIONS)[number]["id"];

const WEIGHTS: Record<TrackId, Record<DimensionId, number>> = {
  sprint: { decomposition: 0.25, steering: 0.25, verification: 0.2, code_quality: 0.2, communication: 0.1 },
  weak: { decomposition: 0.25, steering: 0.3, verification: 0.25, code_quality: 0.1, communication: 0.1 },
  precision: { decomposition: 0.1, steering: 0.2, verification: 0.15, code_quality: 0.15, communication: 0.4 },
  review: { decomposition: 0.15, steering: 0.15, verification: 0.3, code_quality: 0.25, communication: 0.15 },
};

const dim = z.object({ score: z.coerce.number().min(1).max(4), evidence: z.string().default("") });

export const reportSchema = z.object({
  summary: z.string(),
  dimensions: z.object({
    decomposition: dim,
    steering: dim,
    verification: dim,
    code_quality: dim,
    communication: dim,
  }),
  traps: z.array(z.object({ trap: z.string(), caught: z.boolean(), note: z.string().default("") })).default([]),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  followups: z.array(z.string()).min(1),
});

export type GraderReport = z.infer<typeof reportSchema>;

export const finalSchema = z.object({
  followup_score: z.coerce.number().min(1).max(4),
  followup_evidence: z.string().default(""),
  final_summary: z.string().default(""),
});

export interface StoredReport extends GraderReport {
  track: TrackId;
  testRatio: number;
  baseScore: number;
  weights: Record<DimensionId, number>;
  final?: z.infer<typeof finalSchema> & { adjustment: number };
}

export function computeScore(track: TrackId, r: GraderReport, hiddenPassed: number, hiddenTotal: number) {
  const w = WEIGHTS[track];
  const dimScore = DIMENSIONS.reduce((s, d) => s + w[d.id] * ((r.dimensions[d.id].score - 1) / 3), 0);
  const testRatio = hiddenTotal ? hiddenPassed / hiddenTotal : 0;
  return { score: Math.round(100 * (0.35 * testRatio + 0.65 * dimScore)), testRatio, weights: w };
}

export function followupAdjustment(followupScore: number) {
  return Math.round(((followupScore - 2.5) / 1.5) * 10);
}

export function verdictFor(score: number) {
  if (score >= 85) return "Strong hire";
  if (score >= 70) return "Hire";
  if (score >= 55) return "Lean hire";
  if (score >= 40) return "Lean no hire";
  return "No hire";
}

export function buildDiff(starter: Record<string, string>, files: Record<string, string>, maxChars = 40_000) {
  const paths = new Set([...Object.keys(starter), ...Object.keys(files)]);
  let out = "";
  for (const p of [...paths].sort()) {
    if (p.startsWith("tests/hidden/")) continue;
    const a = starter[p];
    const b = files[p];
    if (a === b) continue;
    out += createTwoFilesPatch(a === undefined ? "/dev/null" : `a/${p}`, b === undefined ? "/dev/null" : `b/${p}`, a ?? "", b ?? "", "", "", { context: 3 });
    if (out.length > maxChars) return out.slice(0, maxChars) + "\n… [diff truncated]";
  }
  return out || "(no changes)";
}

export function renderTranscript(messages: ApiMessage[], maxChars = 60_000) {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "user") lines.push(`\n### CANDIDATE\n${m.content}`);
    else if (m.role === "assistant") {
      if (m.content) lines.push(`\n### AGENT\n${m.content.slice(0, 3000)}`);
      for (const c of m.tool_calls ?? []) lines.push(`→ tool ${c.function.name}(${c.function.arguments.slice(0, 400)})`);
    } else lines.push(`← result: ${m.content.slice(0, 300).replace(/\n/g, " ⏎ ")}`);
  }
  const s = lines.join("\n");
  return s.length > maxChars ? "… [earlier transcript truncated]\n" + s.slice(-maxChars) : s || "(the candidate never used the agent)";
}

export function renderTimeline(events: WorkspaceEvent[], startedAt: Date) {
  const t0 = startedAt.getTime();
  return (
    events
      .slice(-250)
      .map((e) => {
        const s = Math.max(0, Math.round((e.t - t0) / 1000));
        return `[${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}] ${e.type}: ${e.detail.slice(0, 200)}`;
      })
      .join("\n") || "(no events)"
  );
}

export function renderTests(label: string, r: RunResult | null | undefined) {
  if (!r) return `${label}: not run`;
  return `${label}: ${r.passed} passed, ${r.failed} failed\n${r.tests
    .filter((t) => t.status === "fail")
    .map((t) => `  ✗ ${t.name}: ${t.error?.slice(0, 300)}`)
    .join("\n")}`;
}

export function graderContext(p: {
  problem: ProblemBundle;
  elapsedSec: number;
  transcript: string;
  timeline: string;
  notes: string;
  diff: string;
  hidden: RunResult;
  visible: RunResult | null;
}) {
  return `# Track: ${p.problem.track} · Difficulty: ${p.problem.difficulty} · Time limit: ${p.problem.timeLimit} min · Time used: ${Math.round(p.elapsedSec / 60)} min

# Task given to the candidate
${p.problem.prompt}

# Private rubric
${p.problem.rubric || "(none)"}

# Hidden test results (the candidate could not see these tests)
${renderTests("hidden", p.hidden)}

# Visible test results at submit
${renderTests("visible", p.visible)}

# Candidate's notes / narration
${p.notes.trim() || "(empty)"}

# Timeline
${p.timeline}

# Conversation with the agent
${p.transcript}

# Final diff vs. starter
\`\`\`diff
${p.diff}
\`\`\``;
}
