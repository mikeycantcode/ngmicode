import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRACKS, MODELS, MODEL_LABELS, type TrackId } from "@/lib/taxonomy";
import { TRACK_TEXT } from "@/components/track-badge";
import { listProblems } from "@/lib/problems";

export const metadata: Metadata = { title: "Interview formats" };

const DETAIL: Record<TrackId, { real: string; skills: string[]; scored: string }> = {
  sprint: {
    real: "Several companies now run AI-enabled rounds where you get a multi-file codebase, an AI assistant inside the IDE (file explorer, editor, and chat side by side), and a feature to ship before time runs out.",
    skills: ["Orient in thousands of lines fast", "Decompose the feature into agent-sized steps", "Spot where the agent ignores codebase conventions", "Verify with tests before you trust it"],
    scored: "Decomposition and steering weigh most; hidden tests check the key behavior and the trap.",
  },
  weak: {
    real: "Some loops deliberately give you a smaller or older model so the interviewer can see you compensate: feeding context, chunking work, and catching hallucinated APIs.",
    skills: ["Feed exact context (attach files)", "One change per instruction", "Re-state facts it forgot", "Catch subtly wrong edits"],
    scored: "Steering and verification weigh most. The model forgets anything beyond its last ~16 messages.",
  },
  precision: {
    real: "Interviewers increasingly test whether you can specify behavior exactly — the skill that separates engineers who direct agents from those who get directed by them.",
    skills: ["Name files, functions and signatures", "Specify ordering, tie-breaks, rounding, errors", "Anticipate edge cases before the agent does", "Narrate intent in notes"],
    scored: "Communication & precision is 40% of the rubric. The literal agent will stop and ask if you leave gaps.",
  },
  review: {
    real: "Code-comprehension rounds hand you existing code with a few hundred lines across files and ask you to read, debug and optimize it, with an AI assistant available.",
    skills: ["Read before you prompt", "Form and test hypotheses", "Explain root cause, not symptoms", "Optimize without breaking behavior"],
    scored: "Verification and code quality weigh most. Interviewers probe whether you understand the fix.",
  },
};

export default function FormatsPage() {
  const problems = listProblems();
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Interview formats</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        AI-assisted rounds don&apos;t test whether you can type an algorithm from memory. They test whether you can direct a capable but context-blind collaborator through real code, and prove the result is right.
      </p>
      <div className="mt-10 space-y-6">
        {Object.values(TRACKS).map((t) => {
          const d = DETAIL[t.id];
          const model = t.agent === "weak" ? MODELS.weak : MODELS.strong;
          return (
            <section key={t.id} className="rounded-xl border bg-card p-6">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className={`text-xl font-semibold ${TRACK_TEXT[t.id]}`}>{t.name}</h2>
                <span className="font-mono text-xs text-muted-foreground">agent: {MODEL_LABELS[model] ?? model}{t.agent === "literal" ? " (literal mode)" : ""}</span>
                <span className="ml-auto text-xs text-muted-foreground">{problems.filter((p) => p.track === t.id).length} problems</span>
              </div>
              <p className="mt-3 text-sm">{t.description}</p>
              <p className="mt-2 text-sm text-muted-foreground">{d.real}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">What you practice</div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {d.skills.map((s) => (
                      <li key={s} className="flex gap-2">
                        <span className={TRACK_TEXT[t.id]}>›</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">How it&apos;s scored</div>
                  <p className="mt-2 text-sm text-muted-foreground">{d.scored}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-5" render={<Link href={`/problems?track=${t.id}`} />}>
                Browse {t.short.toLowerCase()} problems <ArrowRight />
              </Button>
            </section>
          );
        })}
      </div>
      <section className="mt-10 rounded-xl border bg-ctp-mantle/50 p-6 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">The score</h2>
        <p className="mt-2">
          35% hidden tests (deliberately few — 1 to 4 per problem), 65% rubric: decomposition, agent steering, verification, code quality, and communication, weighted by format. A follow-up interview adjusts the final score by up to ±10. 70+ counts as solved.
        </p>
      </section>
    </div>
  );
}
