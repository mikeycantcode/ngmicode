"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, Files, GitPullRequest, FileText, FlaskConical, GitBranch, Loader2, NotebookPen, Play, Search, Send, Timer, XCircle } from "lucide-react";
import { useWorkspace, changedFiles, type Persisted, type SidePanel } from "./store";
import { Explorer } from "./explorer";
import { SearchPanel } from "./search-panel";
import { EditorArea, subscribeCursor } from "./editor-area";
import { BottomPanel } from "./bottom-panel";
import { AgentPanel } from "./agent-panel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { DifficultyLabel, TrackBadge } from "@/components/track-badge";
import { TRACKS, type Difficulty, type TrackId } from "@/lib/taxonomy";
import type { AgentMode } from "@/lib/agent/types";
import { runInWorker } from "@/lib/runner/client";
import { isTestFile } from "@/lib/runner/core";
import { cn } from "@/lib/utils";

export interface WorkspaceProblem {
  slug: string;
  title: string;
  prompt: string;
  track: TrackId;
  difficulty: Difficulty;
  timeLimit: number;
  base: string;
  category: string;
  categoryName: string;
  summary: string;
  starter: Record<string, string>;
  loc: number;
  repo?: { repo: string; commit: string; license: string; url: string };
}

function fmtTime(sec: number) {
  const s = Math.abs(Math.round(sec));
  return `${sec < 0 ? "-" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function useCountdown(startedAt: number | null, limitMin: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return limitMin * 60;
  return limitMin * 60 - (now - startedAt) / 1000;
}

function ProblemView({ p }: { p: WorkspaceProblem }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <TrackBadge track={p.track} />
        <DifficultyLabel difficulty={p.difficulty} />
        <span className="text-xs text-muted-foreground">· {p.categoryName}</span>
      </div>
      <h1 className="mb-3 text-lg font-semibold">{p.title}</h1>
      {p.repo && (
        <a
          href={`${p.repo.url}/tree/${p.repo.commit}`}
          target="_blank"
          rel="noreferrer"
          className="mb-3 flex w-fit items-center gap-1.5 rounded-md bg-ctp-sapphire/10 px-2 py-1 font-mono text-[11px] text-ctp-sapphire ring-1 ring-ctp-sapphire/25 hover:bg-ctp-sapphire/15"
        >
          <GitPullRequest className="size-3" /> real-world · {p.repo.repo}@{p.repo.commit.slice(0, 7)} · {p.repo.license}
        </a>
      )}
      <div className="prose-ctp">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.prompt.replace(/^\s*#\s+[^\n]*\n+/, "")}</ReactMarkdown>
      </div>
      <div className="mt-6 rounded-lg border bg-ctp-crust/40 p-3 text-xs text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">{TRACKS[p.track].name} round</div>
        {TRACKS[p.track].description}
      </div>
    </div>
  );
}

function NotesView({ track }: { track: TrackId }) {
  const notes = useWorkspace((s) => s.notes);
  const setNotes = useWorkspace((s) => s.setNotes);
  return (
    <div className="flex h-full flex-col p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        {track === "precision"
          ? "Narrate your spec here: exact behavior, edge cases, and why. The grader weighs this heavily in this round."
          : "Your plan, assumptions and reasoning. The grader reads this like an interviewer listening to you think aloud."}
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={"1. Orient: …\n2. Plan: …\n3. Risks / edge cases: …\n4. Verification: …"}
        className="flex-1 resize-none rounded-md border bg-ctp-base p-3 font-mono text-[12.5px] leading-relaxed outline-none focus:border-ctp-mauve/60"
      />
    </div>
  );
}

const SIDE_ITEMS: { id: SidePanel; icon: typeof Files; label: string }[] = [
  { id: "problem", icon: FileText, label: "Problem" },
  { id: "explorer", icon: Files, label: "Explorer" },
  { id: "search", icon: Search, label: "Search" },
  { id: "notes", icon: NotebookPen, label: "Notes" },
];

function StatusBar({ p, modelLabel }: { p: WorkspaceProblem; modelLabel: string }) {
  const [pos, setPos] = useState({ line: 1, col: 1 });
  useEffect(() => subscribeCursor(setPos), []);
  const run = useWorkspace((s) => s.testRun);
  const n = useWorkspace((s) => changedFiles(s.starter, s.files).length);
  const busy = useWorkspace((s) => s.agentBusy);
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 bg-ctp-mauve px-2 text-[11px] text-ctp-crust">
      <span className="flex items-center gap-1 font-medium">
        <GitBranch className="size-3" /> {p.repo ? `${p.repo.repo}@${p.repo.commit.slice(0, 7)}` : `interview/${p.base}`}
      </span>
      <span>{n} changed</span>
      {run.result && (
        <span className="flex items-center gap-1">
          {run.result.failed ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
          {run.result.passed}/{run.result.passed + run.result.failed} tests
        </span>
      )}
      <span className="ml-auto flex items-center gap-1">{busy && <Loader2 className="size-3 animate-spin" />}{modelLabel}</span>
      <span>
        Ln {pos.line}, Col {pos.col}
      </span>
      <span>TypeScript</span>
    </div>
  );
}

export function Workspace({ problem: p, mode, modelLabel }: { problem: WorkspaceProblem; mode: AgentMode; modelLabel: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<{ id: string; startedAt: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitStage, setSubmitStage] = useState<null | "hidden" | "grading">(null);
  const side = useWorkspace((s) => s.side);
  const setSide = useWorkspace((s) => s.setSide);
  const runTests = useWorkspace((s) => s.runTests);
  const testRunning = useWorkspace((s) => s.testRun.running);
  const remaining = useCountdown(attempt?.startedAt ?? null, p.timeLimit);
  const sideRef = useRef<{ collapse: () => void; expand: () => void; isCollapsed: () => boolean } | null>(null);

  const start = useCallback(
    async (fresh = false) => {
      setStarting(true);
      try {
        const res = await fetch("/api/attempts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: p.slug, fresh }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        let saved: Partial<Persisted> | undefined;
        try {
          const raw = localStorage.getItem(`steer:${j.id}`);
          if (raw) saved = JSON.parse(raw);
        } catch {}
        useWorkspace.getState().init({ slug: p.slug, attemptId: j.id, mode, starter: p.starter, saved });
        setAttempt({ id: j.id, startedAt: new Date(j.startedAt).getTime() });
        if (j.resumed) toast.info("Resumed your in-progress attempt.");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setStarting(false);
      }
    },
    [p.slug, p.starter, mode],
  );

  // Persist workspace to localStorage (per attempt).
  useEffect(() => {
    if (!attempt) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = useWorkspace.subscribe((s) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const data: Persisted = { files: s.files, messages: s.messages, events: s.events, notes: s.notes, openTabs: s.openTabs, active: s.active, tokens: s.tokens };
        try {
          localStorage.setItem(`steer:${attempt.id}`, JSON.stringify(data));
        } catch {}
      }, 800);
    });
    return () => {
      unsub();
      if (t) clearTimeout(t);
    };
  }, [attempt]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "'") {
        e.preventDefault();
        if (attempt) runTests("user");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [attempt, runTests]);

  const toggleSide = (id: SidePanel) => {
    const panel = sideRef.current;
    if (side === id && panel && !panel.isCollapsed()) panel.collapse();
    else {
      setSide(id);
      panel?.expand();
    }
  };

  const submit = async () => {
    if (!attempt) return;
    const ws = useWorkspace.getState();
    if (ws.agentBusy) {
      toast.error("Wait for the agent to finish (or stop it) before submitting.");
      return;
    }
    try {
      setSubmitStage("hidden");
      const hr = await fetch(`/api/attempts/${attempt.id}/hidden`);
      const hj = await hr.json();
      if (!hr.ok) throw new Error(hj.error);
      const all = { ...ws.files, ...hj.files };
      const hidden = await runInWorker(all, Object.keys(hj.files));
      const visibleFiles = Object.keys(ws.files).filter((f) => isTestFile(f) && !f.startsWith("tests/hidden/"));
      const visible = visibleFiles.length ? await runInWorker(ws.files, visibleFiles) : null;
      setSubmitStage("grading");
      const res = await fetch(`/api/attempts/${attempt.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: ws.files, hidden, visible, messages: ws.messages, events: ws.events, notes: ws.notes }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      router.push(`/attempts/${attempt.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSubmitStage(null);
    }
  };

  if (!attempt) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex h-12 items-center gap-3 border-b px-4">
          <Link href="/problems" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> Problems
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-4 py-10 lg:grid-cols-[1fr_300px]">
          <div className="rounded-xl border bg-card">
            <ProblemView p={p} />
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <div className="text-xs text-muted-foreground uppercase">Interview setup</div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Format</dt><dd>{TRACKS[p.track].name}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Time</dt><dd>{p.timeLimit} minutes</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Codebase</dt><dd className="font-mono">{p.repo?.repo ?? p.base}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Size</dt><dd>{Object.keys(p.starter).length} files · {p.loc.toLocaleString()} LOC</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Agent</dt><dd className="text-right font-mono text-xs">{modelLabel}</dd></div>
              </dl>
              <Button className="mt-5 h-9 w-full" onClick={() => start()} disabled={starting}>
                {starting ? <Loader2 className="animate-spin" /> : <Timer />} Start interview
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">The timer starts now. Resumes if you have one in progress.</p>
            </div>
            <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              <div className="mb-2 font-medium text-foreground">How you&apos;re graded</div>
              A few hidden tests check the key behavior. An AI grader then reviews your prompts, tool usage, tests, notes and diff — then interviews you about it.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const low = remaining < 300;
  const over = remaining < 0;
  const nChanged = changedFiles(useWorkspace.getState().starter, useWorkspace.getState().files).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Title bar */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-ctp-crust px-3">
        <Link href="/problems" aria-label="Back to problems">
          <LogoMark className="size-6" />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{p.title}</span>
          <TrackBadge track={p.track} />
          <DifficultyLabel difficulty={p.difficulty} />
        </div>
        <div
          className={cn(
            "absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm tabular-nums",
            over ? "bg-ctp-red/15 text-ctp-red" : low ? "bg-ctp-peach/15 text-ctp-peach" : "bg-ctp-surface0 text-foreground",
          )}
        >
          <Timer className="size-3.5" /> {fmtTime(remaining)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => runTests("user")} disabled={testRunning}>
            {testRunning ? <Loader2 className="animate-spin" /> : <Play className="text-ctp-green" />} Run
          </Button>
          <Button size="sm" onClick={() => setSubmitOpen(true)}>
            <Send /> Submit
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-ctp-crust py-2">
          {SIDE_ITEMS.map((it) => (
            <Tooltip key={it.id}>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => toggleSide(it.id)}
                    className={cn(
                      "relative flex size-10 items-center justify-center rounded-md text-ctp-overlay1 hover:text-foreground",
                      side === it.id && "text-foreground before:absolute before:top-2 before:bottom-2 before:-left-1 before:w-0.5 before:rounded before:bg-ctp-mauve",
                    )}
                  />
                }
              >
                <it.icon className="size-5" />
              </TooltipTrigger>
              <TooltipContent side="right">{it.label}</TooltipContent>
            </Tooltip>
          ))}
          <Tooltip>
            <TooltipTrigger
              render={<button onClick={() => runTests("user")} className="mt-auto flex size-10 items-center justify-center rounded-md text-ctp-overlay1 hover:text-ctp-green" />}
            >
              <FlaskConical className="size-5" />
            </TooltipTrigger>
            <TooltipContent side="right">Run tests (⌘&apos;)</TooltipContent>
          </Tooltip>
        </nav>

        <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
          <ResizablePanel
            defaultSize="24%"
            minSize="14%"
            maxSize="45%"
            collapsible
            panelRef={sideRef as never}
            className="bg-ctp-mantle"
          >
            <div className="flex h-full flex-col">
              <div className="flex h-9 shrink-0 items-center border-b px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {SIDE_ITEMS.find((s) => s.id === side)?.label}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {side === "problem" && <ProblemView p={p} />}
                {side === "explorer" && <Explorer />}
                {side === "search" && <SearchPanel />}
                {side === "notes" && <NotesView track={p.track} />}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="46%" minSize="25%">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="68%" minSize="20%">
                <EditorArea />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="32%" minSize="10%" collapsible>
                <BottomPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="30%" minSize="20%" maxSize="50%">
            <AgentPanel modelLabel={modelLabel} track={p.track} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <StatusBar p={p} modelLabel={modelLabel} />

      <Dialog open={submitOpen} onOpenChange={(o) => !submitStage && setSubmitOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for grading?</DialogTitle>
            <DialogDescription>
              Hidden tests run against your workspace, then the AI grader reviews your session and an interviewer asks follow-up questions. You can&apos;t edit after submitting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Files changed</span><span>{nChanged}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Agent messages</span><span>{useWorkspace.getState().messages.filter((m) => m.role === "user").length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span>{useWorkspace.getState().notes.trim() ? "written" : <span className="text-ctp-peach">empty</span>}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Time used</span><span>{fmtTime(p.timeLimit * 60 - remaining)}</span></div>
          </div>
          {submitStage && (
            <div className="flex items-center gap-2 rounded-md bg-ctp-surface0/60 px-3 py-2 text-sm">
              <Loader2 className="size-4 animate-spin text-ctp-mauve" />
              {submitStage === "hidden" ? "Running hidden tests…" : "Grader is reviewing your session (≈20–60s)…"}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={!!submitStage}>
              Keep working
            </Button>
            <Button onClick={submit} disabled={!!submitStage}>
              <Send /> Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
