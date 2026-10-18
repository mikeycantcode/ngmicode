import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getProblem } from "@/lib/problems";
import { CATEGORY_BY_ID, MODELS, MODEL_LABELS, TRACKS } from "@/lib/taxonomy";
import { Workspace } from "@/components/workspace/workspace";

export async function generateMetadata({ params }: PageProps<"/problems/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = getProblem(slug);
  return { title: p?.title ?? "Problem" };
}

export default async function ProblemPage({ params }: PageProps<"/problems/[slug]">) {
  const { slug } = await params;
  const p = getProblem(slug);
  if (!p) notFound();
  const user = await getUser();
  if (!user) redirect(`/login?next=/problems/${slug}`);

  const mode = TRACKS[p.track].agent;
  const model = mode === "weak" ? MODELS.weak : MODELS.strong;
  return (
    <Workspace
      mode={mode}
      modelLabel={MODEL_LABELS[model] ?? model}
      problem={{
        slug: p.slug,
        title: p.title,
        prompt: p.prompt,
        track: p.track,
        difficulty: p.difficulty,
        timeLimit: p.timeLimit,
        base: p.base,
        category: p.category,
        categoryName: CATEGORY_BY_ID[p.category]?.name ?? p.category,
        summary: p.summary,
        starter: p.starter,
        loc: p.loc,
        repo: p.repo,
      }}
    />
  );
}
