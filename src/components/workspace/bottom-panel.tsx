"use client";

import { useMemo } from "react";
import { diffLines } from "diff";
import { CheckCircle2, CircleSlash, Loader2, Play, XCircle } from "lucide-react";
import { changedFiles, useWorkspace, type BottomPanel as BP } from "./store";
import { FileIcon } from "./explorer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function TestsView() {
  const run = useWorkspace((s) => s.testRun);
  const runTests = useWorkspace((s) => s.runTests);
  const openFile = useWorkspace((s) => s.openFile);
  const r = run.result;
  const byFile = useMemo(() => {
    const m = new Map<string, NonNullable<typeof r>["tests"]>();
    for (const t of r?.tests ?? []) m.set(t.file, [...(m.get(t.file) ?? []), t]);
    return [...m.entries()];
  }, [r]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-3 py-1.5 text-xs">
        <Button size="xs" variant="secondary" onClick={() => runTests("user")} disabled={run.running}>
          {run.running ? <Loader2 className="animate-spin" /> : <Play className="text-ctp-green" />} Run visible tests
        </Button>
        {r && (
          <span className="text-muted-foreground">
            <span className="text-ctp-green">{r.passed} passed</span>
            {r.failed > 0 && <span className="text-ctp-red"> · {r.failed} failed</span>} · {r.durationMs}ms
            {run.source === "agent" && <span className="ml-1 text-ctp-mauve">(run by agent)</span>}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">Hidden tests run on submit.</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px]">
        {!r && !run.running && <p className="text-muted-foreground">No test run yet. Press ⌘&apos; or click Run.</p>}
        {run.running && !r && <p className="text-muted-foreground">Running…</p>}
        {byFile.map(([file, tests]) => (
          <div key={file} className="mb-2">
            <button onClick={() => openFile(file)} className="flex items-center gap-1.5 text-ctp-subtext1 hover:text-foreground">
              <FileIcon path={file} /> {file}
            </button>
            {tests.map((t, i) => (
              <div key={i} className="ml-5">
                <div className="flex items-start gap-1.5 py-0.5">
                  {t.status === "pass" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ctp-green" />
                  ) : t.status === "skip" ? (
                    <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-ctp-overlay0" />
                  ) : (
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-ctp-red" />
                  )}
                  <span className={t.status === "fail" ? "text-foreground" : "text-muted-foreground"}>{t.name}</span>
                  <span className="ml-auto text-[10px] text-ctp-overlay0">{t.durationMs}ms</span>
                </div>
                {t.error && <pre className="ml-5 overflow-x-auto whitespace-pre-wrap rounded bg-ctp-red/10 px-2 py-1 text-[11px] text-ctp-red">{t.error}</pre>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsoleView() {
  const r = useWorkspace((s) => s.testRun.result);
  return (
    <div className="h-full overflow-y-auto px-3 py-2 font-mono text-[12px]">
      {!r?.logs.length ? (
        <p className="text-muted-foreground">console output from the last test run appears here.</p>
      ) : (
        r.logs.map((l, i) => (
          <div key={i} className={cn("whitespace-pre-wrap", l.startsWith("[error]") ? "text-ctp-red" : l.startsWith("[warn]") ? "text-ctp-yellow" : "text-ctp-subtext1")}>
            {l}
          </div>
        ))
      )}
    </div>
  );
}

function ChangesView() {
  const starter = useWorkspace((s) => s.starter);
  const files = useWorkspace((s) => s.files);
  const openDiff = useWorkspace((s) => s.openDiff);
  const touched = useWorkspace((s) => s.agentTouched);
  const changes = useMemo(
    () =>
      changedFiles(starter, files).map((c) => {
        let add = 0;
        let del = 0;
        for (const part of diffLines(starter[c.path] ?? "", files[c.path] ?? "")) {
          if (part.added) add += part.count ?? 0;
          if (part.removed) del += part.count ?? 0;
        }
        return { ...c, add, del };
      }),
    [starter, files],
  );
  return (
    <div className="h-full overflow-y-auto py-1 text-[12.5px]">
      {!changes.length && <p className="px-3 py-1 text-muted-foreground">No changes yet.</p>}
      {changes.map((c) => (
        <button key={c.path} onClick={() => c.status !== "deleted" && openDiff(c.path)} className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-ctp-surface0/60">
          <FileIcon path={c.path} />
          <span className="font-mono">{c.path}</span>
          {touched[c.path] && <span className="rounded bg-ctp-mauve/15 px-1 text-[10px] text-ctp-mauve">agent</span>}
          <span className="ml-auto font-mono text-[11px]">
            <span className="text-ctp-green">+{c.add}</span> <span className="text-ctp-red">−{c.del}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function BottomPanel() {
  const bottom = useWorkspace((s) => s.bottom);
  const setBottom = useWorkspace((s) => s.setBottom);
  const failed = useWorkspace((s) => s.testRun.result?.failed ?? 0);
  const running = useWorkspace((s) => s.testRun.running);
  const nChanges = useWorkspace((s) => changedFiles(s.starter, s.files).length);
  const tabs: { id: BP; label: React.ReactNode }[] = [
    {
      id: "tests",
      label: (
        <>
          Tests {running ? <Loader2 className="size-3 animate-spin" /> : failed > 0 ? <span className="rounded bg-ctp-red/20 px-1 text-ctp-red">{failed}</span> : null}
        </>
      ),
    },
    { id: "console", label: "Console" },
    { id: "changes", label: <>Changes {nChanges > 0 && <span className="rounded bg-ctp-yellow/20 px-1 text-ctp-yellow">{nChanges}</span>}</> },
  ];
  return (
    <div className="flex h-full flex-col bg-ctp-mantle">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setBottom(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-2 py-1 text-[11px] font-medium tracking-wide uppercase",
              bottom === t.id ? "border-ctp-mauve text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{bottom === "tests" ? <TestsView /> : bottom === "console" ? <ConsoleView /> : <ChangesView />}</div>
    </div>
  );
}
