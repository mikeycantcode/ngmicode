"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import type { ProblemMeta } from "@/lib/content-types";
import { CATEGORIES, CATEGORY_BY_ID, type TrackId } from "@/lib/taxonomy";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DifficultyLabel, TrackBadge } from "@/components/track-badge";
import { cn } from "@/lib/utils";

/** Node centers in grid units: x in [0, 4], y = row. */
const POS: Record<string, [number, number]> = {
  fundamentals: [2, 0],
  comprehension: [1, 1],
  specs: [3, 1],
  debugging: [0.5, 2],
  features: [2, 2],
  delegation: [3.5, 2],
  performance: [0, 3],
  async: [1, 3],
  refactoring: [2.1, 3],
  "data-api": [3.1, 3],
  security: [1.4, 4],
  testing: [3.2, 4],
  integration: [2, 5],
};

const COLS = 4;
const ROWS = 6;
const ROW_H = 120;

interface Progress {
  solved: boolean;
  best: number | null;
}

export function RoadmapTree({ problems, progress }: { problems: ProblemMeta[]; progress: Record<string, Progress> }) {
  const [open, setOpen] = useState<string | null>(null);
  const byCat = (id: string) => problems.filter((p) => p.category === id);
  const pct = (x: number) => `${10 + (x / COLS) * 80}%`;
  const height = ROWS * ROW_H;

  const edges = CATEGORIES.flatMap((c) => c.parents.map((p) => [p, c.id] as const));
  const selected = open ? CATEGORY_BY_ID[open] : null;

  return (
    <>
      {/* Desktop tree */}
      <div className="relative mt-8 hidden overflow-hidden rounded-xl border bg-ctp-mantle/40 md:block" style={{ height: height + 40 }}>
        <div className="bg-grid absolute inset-0 opacity-60" />
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 1000 ${height + 40}`}>
          {edges.map(([from, to]) => {
            const [x1, y1] = POS[from];
            const [x2, y2] = POS[to];
            const ax = 100 + (x1 / COLS) * 800;
            const bx = 100 + (x2 / COLS) * 800;
            const ay = 20 + y1 * ROW_H + ROW_H / 2 + 30;
            const by = 20 + y2 * ROW_H + ROW_H / 2 - 30;
            const done = byCat(from).length > 0 && byCat(from).every((p) => progress[p.slug]?.solved);
            return (
              <path
                key={`${from}-${to}`}
                d={`M ${ax} ${ay} C ${ax} ${(ay + by) / 2}, ${bx} ${(ay + by) / 2}, ${bx} ${by}`}
                fill="none"
                stroke={done ? "var(--ctp-green)" : "var(--ctp-surface2)"}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={done ? undefined : "4 4"}
              />
            );
          })}
        </svg>
        {CATEGORIES.map((c) => {
          const [x, y] = POS[c.id];
          const list = byCat(c.id);
          const solved = list.filter((p) => progress[p.slug]?.solved).length;
          const ratio = list.length ? solved / list.length : 0;
          return (
            <button
              key={c.id}
              onClick={() => setOpen(c.id)}
              className={cn(
                "absolute flex h-[60px] w-[176px] flex-col justify-center -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-[calc(50%+2px)] hover:border-ctp-mauve/60 hover:shadow-ctp-mauve/10 hover:shadow-lg",
                ratio === 1 && "border-ctp-green/50",
              )}
              style={{ left: pct(x), top: 20 + y * ROW_H + ROW_H / 2 }}
            >
              <div className="truncate text-sm font-semibold">{c.name}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ctp-surface0">
                  <div className="h-full rounded-full bg-gradient-to-r from-ctp-mauve to-ctp-green transition-all" style={{ width: `${ratio * 100}%` }} />
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {solved}/{list.length}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mobile list */}
      <div className="mt-6 grid gap-2 md:hidden">
        {CATEGORIES.map((c) => {
          const list = byCat(c.id);
          const solved = list.filter((p) => progress[p.slug]?.solved).length;
          return (
            <button key={c.id} onClick={() => setOpen(c.id)} className="rounded-lg border bg-card px-4 py-3 text-left">
              <div className="flex items-center justify-between text-sm font-semibold">
                {c.name}
                <span className="text-xs text-muted-foreground">
                  {solved}/{list.length}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{c.blurb}</div>
            </button>
          );
        })}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{selected.blurb}</SheetDescription>
              </SheetHeader>
              <div className="grid gap-1 px-4 pb-6">
                {byCat(selected.id).map((p) => {
                  const pr = progress[p.slug];
                  return (
                    <Link key={p.slug} href={`/problems/${p.slug}`} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted">
                      {pr?.solved ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ctp-green" />
                      ) : pr ? (
                        <CircleDot className="mt-0.5 size-4 shrink-0 text-ctp-yellow" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-ctp-surface2" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{p.title}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <TrackBadge track={p.track as TrackId} />
                          <DifficultyLabel difficulty={p.difficulty} />
                          <span className="font-mono text-[11px] text-muted-foreground">{p.base}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {!byCat(selected.id).length && <p className="text-sm text-muted-foreground">No problems yet.</p>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
