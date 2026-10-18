"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, CircleDot, GitPullRequest, Search, Timer } from "lucide-react";
import type { ProblemMeta } from "@/lib/content-types";
import { CATEGORIES, CATEGORY_BY_ID, TRACKS, type TrackId } from "@/lib/taxonomy";
import { Input } from "@/components/ui/input";
import { DifficultyLabel, TrackBadge } from "@/components/track-badge";
import { cn } from "@/lib/utils";

interface Progress {
  best: number | null;
  attempts: number;
  solved: boolean;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors",
        active ? "border-ctp-mauve/50 bg-ctp-mauve/15 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ProblemTable({
  problems,
  progress,
  signedIn,
  initial,
}: {
  problems: ProblemMeta[];
  progress: Record<string, Progress>;
  signedIn: boolean;
  initial: { track?: string; category?: string; difficulty?: string; origin?: string };
}) {
  const [q, setQ] = useState("");
  const [track, setTrack] = useState<string | undefined>(initial.track);
  const [difficulty, setDifficulty] = useState<string | undefined>(initial.difficulty);
  const [category, setCategory] = useState<string | undefined>(initial.category);
  const [status, setStatus] = useState<"all" | "todo" | "solved">("all");
  const [origin, setOrigin] = useState<"all" | "real" | "original">(initial.origin === "real" ? "real" : "all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return problems.filter((p) => {
      if (track && p.track !== track) return false;
      if (difficulty && p.difficulty !== difficulty) return false;
      if (category && p.category !== category) return false;
      if (origin === "real" && !p.repo) return false;
      if (origin === "original" && p.repo) return false;
      if (status === "solved" && !progress[p.slug]?.solved) return false;
      if (status === "todo" && progress[p.slug]?.solved) return false;
      if (needle && !`${p.title} ${p.summary} ${p.base} ${p.repo?.repo ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [problems, q, track, difficulty, category, status, progress, origin]);

  const solved = problems.filter((p) => progress[p.slug]?.solved).length;

  return (
    <div className="mt-8">
      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search problems, codebases, tags…" className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!track} onClick={() => setTrack(undefined)}>All formats</Chip>
            {Object.values(TRACKS).map((t) => (
              <Chip key={t.id} active={track === t.id} onClick={() => setTrack(track === t.id ? undefined : t.id)}>
                {t.name}
              </Chip>
            ))}
          </div>
          {signedIn && (
            <div className="ml-auto text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{solved}</span> / {problems.length} solved
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(difficulty === d ? undefined : d)}>
              <span className="capitalize">{d}</span>
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <Chip active={origin === "real"} onClick={() => setOrigin(origin === "real" ? "all" : "real")}>
            <GitPullRequest className="mr-1 inline size-3" />
            Real-world PRs
          </Chip>
          <Chip active={origin === "original"} onClick={() => setOrigin(origin === "original" ? "all" : "original")}>
            Original codebases
          </Chip>
          <span className="mx-1 h-4 w-px bg-border" />
          <select
            value={category ?? ""}
            onChange={(e) => setCategory(e.target.value || undefined)}
            className="h-7 rounded-md border bg-transparent px-2 text-xs text-muted-foreground"
          >
            <option value="">All topics</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {signedIn && (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              {(["all", "todo", "solved"] as const).map((s) => (
                <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                  <span className="capitalize">{s === "todo" ? "To do" : s}</span>
                </Chip>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-ctp-mantle text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-2.5 font-medium">#</th>
              <th className="w-8 py-2.5" />
              <th className="py-2.5 font-medium">Problem</th>
              <th className="hidden py-2.5 font-medium md:table-cell">Format</th>
              <th className="hidden py-2.5 font-medium lg:table-cell">Topic</th>
              <th className="hidden py-2.5 font-medium sm:table-cell">Codebase</th>
              <th className="py-2.5 font-medium">Difficulty</th>
              <th className="hidden py-2.5 pr-4 text-right font-medium sm:table-cell">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const pr = progress[p.slug];
              return (
                <tr key={p.slug} className="group border-t transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{p.order}</td>
                  <td className="py-3">
                    {pr?.solved ? (
                      <CheckCircle2 className="size-4 text-ctp-green" />
                    ) : pr ? (
                      <CircleDot className="size-4 text-ctp-yellow" />
                    ) : (
                      <Circle className="size-4 text-ctp-surface2" />
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Link href={`/problems/${p.slug}`} className="font-medium group-hover:text-ctp-mauve">
                      {p.title}
                    </Link>
                    <div className="line-clamp-1 text-xs text-muted-foreground">{p.summary}</div>
                  </td>
                  <td className="hidden py-3 md:table-cell">
                    <TrackBadge track={p.track as TrackId} />
                  </td>
                  <td className="hidden py-3 text-xs text-muted-foreground lg:table-cell">{CATEGORY_BY_ID[p.category]?.name}</td>
                  <td className="hidden py-3 font-mono text-xs text-muted-foreground sm:table-cell">
                    {p.repo ? (
                      <span className="inline-flex items-center gap-1 text-ctp-sapphire">
                        <GitPullRequest className="size-3" />
                        {p.repo.repo}
                      </span>
                    ) : (
                      p.base
                    )}
                  </td>
                  <td className="py-3">
                    <DifficultyLabel difficulty={p.difficulty} />
                    {pr?.best != null && <div className="text-[11px] text-muted-foreground tabular-nums">best {pr.best}</div>}
                  </td>
                  <td className="hidden py-3 pr-4 text-right text-xs text-muted-foreground tabular-nums sm:table-cell">
                    <Timer className="mr-1 inline size-3" />
                    {p.timeLimit}m
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No problems match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
