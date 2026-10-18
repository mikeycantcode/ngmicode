import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { listProblems } from "@/lib/problems";
import { getProgress } from "@/lib/progress";
import { TRACKS, type TrackId } from "@/lib/taxonomy";
import { DifficultyLabel, TrackBadge, TRACK_TEXT } from "@/components/track-badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

async function Profile() {
  const user = await getUser();
  if (!user) redirect("/login?next=/profile");
  const db = await getDb();
  const [progress, attempts] = await Promise.all([
    getProgress(user.id),
    db.select().from(schema.attempts).where(eq(schema.attempts.userId, user.id)).orderBy(desc(schema.attempts.startedAt)).limit(50),
  ]);
  const problems = listProblems();
  const bySlug = Object.fromEntries(problems.map((p) => [p.slug, p]));
  const solved = problems.filter((p) => progress[p.slug]?.solved);
  const graded = attempts.filter((a) => a.score != null);
  const avg = graded.length ? Math.round(graded.reduce((s, a) => s + (a.score ?? 0), 0) / graded.length) : null;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
      <p className="text-sm text-muted-foreground">{user.email}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground uppercase">Solved</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {solved.length}
            <span className="text-base text-muted-foreground">/{problems.length}</span>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground uppercase">Interviews graded</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{graded.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground uppercase">Average score</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{avg ?? "—"}</div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground uppercase">By format</div>
          <div className="mt-2 space-y-1 text-sm">
            {Object.values(TRACKS).map((t) => {
              const total = problems.filter((p) => p.track === t.id).length;
              const n = solved.filter((p) => p.track === t.id).length;
              return (
                <div key={t.id} className="flex justify-between">
                  <span className={TRACK_TEXT[t.id]}>{t.short}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {n}/{total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <h2 className="mt-10 text-lg font-semibold">History</h2>
      <div className="mt-3 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-ctp-mantle text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Problem</th>
              <th className="hidden py-2.5 font-medium sm:table-cell">Format</th>
              <th className="py-2.5 font-medium">Status</th>
              <th className="py-2.5 font-medium">Score</th>
              <th className="hidden py-2.5 pr-4 text-right font-medium sm:table-cell">Started</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => {
              const p = bySlug[a.slug];
              if (!p) return null;
              const href = a.status === "active" ? `/problems/${a.slug}` : `/attempts/${a.id}`;
              return (
                <tr key={a.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={href} className="font-medium hover:text-ctp-mauve">
                      {p.title}
                    </Link>
                    <div>
                      <DifficultyLabel difficulty={p.difficulty} />
                    </div>
                  </td>
                  <td className="hidden py-3 sm:table-cell">
                    <TrackBadge track={p.track as TrackId} />
                  </td>
                  <td className="py-3 text-xs capitalize text-muted-foreground">{a.status === "followup" ? "follow-up pending" : a.status}</td>
                  <td className={cn("py-3 font-medium tabular-nums", (a.score ?? 0) >= 70 ? "text-ctp-green" : a.score != null ? "text-ctp-peach" : "text-muted-foreground")}>
                    {a.score ?? "—"}
                  </td>
                  <td className="hidden py-3 pr-4 text-right text-xs text-muted-foreground sm:table-cell">{a.startedAt.toISOString().slice(0, 10)}</td>
                </tr>
              );
            })}
            {!attempts.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No attempts yet. <Link href="/roadmap" className="text-ctp-blue hover:underline">Start with the roadmap.</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" />}>
        <Profile />
      </Suspense>
    </div>
  );
}
