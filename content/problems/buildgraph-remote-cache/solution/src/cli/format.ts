import type { RunSummary } from "../runner/task-runner";
import type { AffectedResult } from "../affected/affected";

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${Math.round(s - m * 60)}s`;
}

const STATUS_LABEL: Record<string, string> = {
  executed: "ran",
  cached: "cache hit",
  failed: "FAILED",
  skipped: "skipped",
};

export function formatRunSummary(s: RunSummary): string {
  const width = Math.max(4, ...s.tasks.map((t) => t.id.length));
  const lines = s.tasks.map((t) => `  ${t.id.padEnd(width)}  ${STATUS_LABEL[t.status].padEnd(9)}  ${formatDuration(t.durationMs)}`);
  const { total, executed, cached, failed } = s.stats;
  lines.push("");
  lines.push(` Tasks:  ${executed + cached} successful, ${total} total${failed ? `, ${failed} failed` : ""}`);
  const remote = s.tasks.filter((t) => t.cacheSource === "remote").length;
  lines.push(` Cached: ${cached} cached (${remote} remote), ${total} total${cached === total && total > 0 ? "  >>> FULL CACHE" : ""}`);
  lines.push(` Time:   ${formatDuration(s.durationMs)}`);
  return lines.join("\n");
}

export function formatAffected(r: AffectedResult): string {
  if (!r.affected.length) return "No packages affected.";
  return r.affected.map((p) => `  ${p}  (${r.reasons[p]})`).join("\n");
}

export function formatLayers(layers: string[][]): string {
  return layers.map((l, i) => `  ${i}: ${l.join(", ")}`).join("\n");
}
