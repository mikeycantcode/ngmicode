import type { Metadata } from "next";
import { Suspense } from "react";
import { listProblems } from "@/lib/problems";
import { getUser } from "@/lib/auth";
import { getProgress } from "@/lib/progress";
import { ProblemTable } from "./problem-table";

export const metadata: Metadata = { title: "Problems" };

async function Table({ searchParams }: { searchParams: PageProps<"/problems">["searchParams"] }) {
  const sp = await searchParams;
  const user = await getUser();
  const progress = user ? await getProgress(user.id) : {};
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <ProblemTable
      problems={listProblems()}
      progress={progress}
      signedIn={!!user}
      initial={{ track: one(sp.track), category: one(sp.category), difficulty: one(sp.difficulty) }}
    />
  );
}

export default function ProblemsPage({ searchParams }: PageProps<"/problems">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every problem is a timed interview round in a real codebase. Pick a format, or follow the roadmap.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-muted/40" />}>
        <Table searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
