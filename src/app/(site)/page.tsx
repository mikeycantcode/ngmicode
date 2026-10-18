import Link from "next/link";
import { ArrowRight, Bot, FileCode2, GitBranch, Gauge, MessagesSquare, ScanSearch, Sparkles, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listProblems } from "@/lib/problems";
import { CATEGORIES, TRACKS, type TrackId } from "@/lib/taxonomy";
import { TRACK_TEXT } from "@/components/track-badge";

const TRACK_ICON: Record<TrackId, typeof Bot> = { sprint: Timer, weak: Gauge, precision: ScanSearch, review: GitBranch };

function IdeMock() {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-ctp-crust shadow-2xl shadow-ctp-mauve/10">
      <div className="flex h-8 items-center gap-1.5 border-b bg-ctp-mantle px-3">
        <span className="size-2.5 rounded-full bg-ctp-red/80" />
        <span className="size-2.5 rounded-full bg-ctp-yellow/80" />
        <span className="size-2.5 rounded-full bg-ctp-green/80" />
        <span className="ml-3 font-mono text-[11px] text-muted-foreground">ledger — partial refunds</span>
        <span className="ml-auto rounded bg-ctp-surface0 px-1.5 font-mono text-[11px] text-ctp-peach">38:12</span>
      </div>
      <div className="grid grid-cols-[150px_1fr_220px] font-mono text-[11px] leading-5">
        <div className="border-r bg-ctp-mantle p-2 text-muted-foreground">
          <div className="text-[10px] uppercase tracking-wider text-ctp-overlay1">Explorer</div>
          <div className="mt-1">▾ src</div>
          <div className="pl-3">▸ domain</div>
          <div className="pl-3">▾ payments</div>
          <div className="pl-6 text-ctp-text">refunds.ts</div>
          <div className="pl-6">capture.ts</div>
          <div className="pl-3">▸ reports</div>
          <div>▸ tests</div>
        </div>
        <div className="p-3">
          <div><span className="text-ctp-mauve">export function</span> <span className="text-ctp-blue">refund</span>(p: Payment, amount: <span className="text-ctp-yellow">Cents</span>) {"{"}</div>
          <div className="pl-4"><span className="text-ctp-mauve">if</span> (amount {">"} p.captured - p.refunded)</div>
          <div className="pl-8"><span className="text-ctp-mauve">throw new</span> <span className="text-ctp-yellow">RefundError</span>(<span className="text-ctp-green">&quot;exceeds captured&quot;</span>);</div>
          <div className="pl-4 bg-ctp-green/10"><span className="text-ctp-green">+</span> postReversal(p, amount); <span className="text-ctp-overlay0">{"// agent"}</span></div>
          <div>{"}"}</div>
          <div className="mt-3 rounded border border-ctp-surface0 bg-ctp-mantle p-2 text-[10px]">
            <span className="text-ctp-green">✓ 14 passed</span> <span className="text-ctp-red">✗ 1 failed</span> — refunds › emits ledger event
          </div>
        </div>
        <div className="border-l bg-ctp-mantle p-2">
          <div className="text-[10px] uppercase tracking-wider text-ctp-overlay1">Agent</div>
          <div className="mt-1 rounded bg-ctp-surface0 p-1.5 text-ctp-text">Refunds must post a reversal journal entry and emit <span className="text-ctp-pink">payment.refunded</span>. Reuse postEntry().</div>
          <div className="mt-1.5 p-1.5 text-muted-foreground">
            <span className="text-ctp-teal">read_file</span> src/ledger/post.ts
            <br />
            <span className="text-ctp-peach">edit_file</span> refunds.ts
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const problems = listProblems();
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const p of problems) counts[p.difficulty]++;
  const bases = new Set(problems.map((p) => p.base)).size;

  return (
    <div>
      <section className="relative overflow-hidden border-b">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border bg-ctp-mantle px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-ctp-mauve" />
              AI-assisted interview rounds are now common at large tech companies
            </div>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              The coding interview changed.
              <br />
              <span className="bg-gradient-to-r from-ctp-mauve via-ctp-pink to-ctp-blue bg-clip-text text-transparent">Practice the new one.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Steer a real coding agent through unfamiliar codebases on a clock. Write specs precise enough for a literal-minded model. Rescue a weak one. Then defend your work to an AI interviewer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="h-10 px-4" render={<Link href="/signup" />}>
                Start practicing — free <ArrowRight />
              </Button>
              <Button size="lg" variant="outline" className="h-10 px-4" render={<Link href="/roadmap" />}>
                View the roadmap
              </Button>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-4 gap-4 text-sm">
              {[
                [problems.length, "problems"],
                [bases, "codebases"],
                [4, "formats"],
                [CATEGORIES.length, "topics"],
              ].map(([n, l]) => (
                <div key={l as string}>
                  <dt className="text-2xl font-semibold tabular-nums text-foreground">{n}</dt>
                  <dd className="text-muted-foreground">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex items-center">
            <IdeMock />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Four interview formats, one workspace</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Each problem simulates a specific round. The agent you get, the clock, and the grading rubric change with the format.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Object.values(TRACKS).map((t) => {
            const Icon = TRACK_ICON[t.id];
            const n = problems.filter((p) => p.track === t.id).length;
            return (
              <Link
                key={t.id}
                href={`/problems?track=${t.id}`}
                className="group rounded-xl border bg-card p-5 transition-colors hover:border-ctp-surface2"
              >
                <Icon className={`size-5 ${TRACK_TEXT[t.id]}`} />
                <h3 className="mt-3 font-semibold">{t.name}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{t.description}</p>
                <div className="mt-4 text-xs text-muted-foreground group-hover:text-foreground">{n} problems →</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-y bg-ctp-mantle/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-3">
          {[
            {
              icon: FileCode2,
              title: "Real codebases, not puzzles",
              body: `${bases} production-shaped TypeScript repos — ledgers, job queues, dispatch engines, build systems — with conventions and traps an unsupervised agent will walk into.`,
            },
            {
              icon: Bot,
              title: "A real agent, in your browser",
              body: "The agent reads files, searches, edits, and runs tests in a sandboxed worker. You see every tool call. Tests run client-side, instantly.",
            },
            {
              icon: MessagesSquare,
              title: "Graded like the real round",
              body: "Few hidden tests by design. An AI grader scores decomposition, steering, verification and communication, then an AI interviewer asks follow-ups.",
            },
          ].map((f) => (
            <div key={f.title}>
              <f.icon className="size-5 text-ctp-mauve" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">From your first internship loop to staff-level re-training</h2>
        <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
          {counts.easy} easy, {counts.medium} medium, {counts.hard} hard. Free account, no card, progress saved.
        </p>
        <Button size="lg" className="mt-6 h-10 px-4" render={<Link href="/signup" />}>
          Create a free account <ArrowRight />
        </Button>
      </section>
    </div>
  );
}
