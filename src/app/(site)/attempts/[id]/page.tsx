import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, ChevronLeft, RotateCcw, XCircle } from "lucide-react";
import { getUser } from "@/lib/auth";
import { getOwnedAttempt, problemForAttempt } from "@/lib/attempts";
import { DIMENSIONS, type StoredReport } from "@/lib/grading";
import type { RunResult } from "@/lib/runner/core";
import { Button } from "@/components/ui/button";
import { DifficultyLabel, TrackBadge } from "@/components/track-badge";
import { FollowupChat } from "./followup-chat";
import { DiffView } from "./diff-view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Interview debrief" };

function ScoreRing({ score, verdict }: { score: number; verdict: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--ctp-green)" : score >= 55 ? "var(--ctp-yellow)" : "var(--ctp-red)";
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--ctp-surface0)" strokeWidth="9" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{score}</span>
        <span className="text-[11px] text-muted-foreground">{verdict}</span>
      </div>
    </div>
  );
}

function Pips({ score }: { score: number }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("h-1.5 w-5 rounded-full", i <= score ? (score >= 3 ? "bg-ctp-green" : score === 2 ? "bg-ctp-yellow" : "bg-ctp-red") : "bg-ctp-surface0")} />
      ))}
    </div>
  );
}

async function Debrief({ params }: { params: PageProps<"/attempts/[id]">["params"] }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=/attempts/${id}`);
  const attempt = await getOwnedAttempt(id, user.id);
  if (!attempt) notFound();
  const problem = problemForAttempt(attempt.slug);
  if (!problem) notFound();

  if (attempt.status === "active" || attempt.status === "grading" || attempt.status === "abandoned") {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">
          {attempt.status === "grading" ? "This attempt is being graded…" : attempt.status === "active" ? "This attempt is still in progress." : "This attempt was abandoned."}
        </p>
        <Button className="mt-4" render={<Link href={`/problems/${attempt.slug}`} />}>
          Go to problem
        </Button>
      </div>
    );
  }

  const report = attempt.report as StoredReport;
  const sub = attempt.submission as { diff: string; hidden: RunResult; elapsedSec: number; notes: string } | null;
  const followup = (attempt.followup as { role: "user" | "assistant"; content: string }[]) ?? [];
  const final = report.final;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/problems" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Problems
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`/problems/${problem.slug}`} className="hover:text-ctp-mauve">
          {problem.title}
        </Link>
        <TrackBadge track={problem.track} />
        <DifficultyLabel difficulty={problem.difficulty} />
        <Button size="sm" variant="outline" className="ml-auto" render={<Link href={`/problems/${problem.slug}`} />}>
          <RotateCcw /> Try again
        </Button>
      </div>

      <section className="mt-6 flex flex-col gap-6 rounded-xl border bg-card p-6 sm:flex-row sm:items-center">
        <ScoreRing score={attempt.score ?? 0} verdict={attempt.verdict ?? ""} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground uppercase">{attempt.status === "complete" ? "Final assessment" : "Initial assessment — follow-up pending"}</div>
          <p className="mt-2 text-[15px] leading-relaxed">{final?.final_summary || report.summary}</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              Hidden tests{" "}
              <span className={cn("font-medium", attempt.hiddenPassed === attempt.hiddenTotal ? "text-ctp-green" : "text-ctp-red")}>
                {attempt.hiddenPassed}/{attempt.hiddenTotal}
              </span>
            </span>
            {sub && <span>Time {Math.round(sub.elapsedSec / 60)} / {problem.timeLimit} min</span>}
            <span>Agent tokens {(attempt.tokens / 1000).toFixed(0)}k</span>
            {final && (
              <span>
                Follow-up{" "}
                <span className={final.adjustment >= 0 ? "text-ctp-green" : "text-ctp-red"}>
                  {final.adjustment >= 0 ? "+" : ""}
                  {final.adjustment}
                </span>
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card">
            <h2 className="border-b px-5 py-3 text-sm font-semibold">Rubric</h2>
            <div className="divide-y">
              {DIMENSIONS.map((d) => {
                const v = report.dimensions[d.id];
                return (
                  <div key={d.id} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{d.name}</span>
                      <span className="text-[11px] text-muted-foreground">weight {Math.round(report.weights[d.id] * 100)}%</span>
                      <div className="ml-auto">
                        <Pips score={v.score} />
                      </div>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{v.evidence}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {report.traps.length > 0 && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Traps</h2>
              <ul className="mt-3 space-y-2">
                {report.traps.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    {t.caught ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ctp-green" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-ctp-red" />}
                    <span>
                      <span className="font-medium">{t.trap}</span> <span className="text-muted-foreground">— {t.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-ctp-green">Strengths</h2>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-ctp-peach">To improve</h2>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {report.improvements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </section>

          {sub && (
            <section className="rounded-xl border bg-card">
              <h2 className="border-b px-5 py-3 text-sm font-semibold">Hidden tests</h2>
              <div className="px-5 py-3 font-mono text-[12px]">
                {sub.hidden.tests.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 py-0.5">
                    {t.status === "pass" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ctp-green" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-ctp-red" />}
                    <span>{t.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sub && <DiffView diff={sub.diff} />}
        </div>

        <div className="lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
          <FollowupChat
            attemptId={attempt.id}
            initial={followup}
            open={attempt.status === "followup"}
            final={final ? { score: final.followup_score, evidence: final.followup_evidence } : null}
          />
        </div>
      </div>
    </>
  );
}

export default function AttemptPage({ params }: PageProps<"/attempts/[id]">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" />}>
        <Debrief params={params} />
      </Suspense>
    </div>
  );
}
