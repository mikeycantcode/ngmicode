import type { Metadata } from "next";
import { Suspense } from "react";
import { listProblems, withoutSource } from "@/lib/problems";
import { getUser } from "@/lib/auth";
import { getProgress } from "@/lib/progress";
import { RoadmapTree } from "./roadmap-tree";

export const metadata: Metadata = { title: "Roadmap" };

async function Tree() {
  const user = await getUser();
  const progress = user ? await getProgress(user.id) : {};
  return <RoadmapTree problems={listProblems().map(withoutSource)} progress={progress} />;
}

export default function RoadmapPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Skills for AI-assisted interviews, in the order they build on each other. Start at the top. Click a topic to see its problems.
      </p>
      <Suspense fallback={<div className="mt-8 h-[720px] animate-pulse rounded-xl bg-muted/40" />}>
        <Tree />
      </Suspense>
    </div>
  );
}
