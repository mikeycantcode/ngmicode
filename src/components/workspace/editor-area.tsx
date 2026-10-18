"use client";

import { useEffect, useRef } from "react";
import Editor, { DiffEditor, type Monaco } from "@monaco-editor/react";
import type * as MonacoNS from "monaco-editor";
import { useTheme } from "next-themes";
import { GitCompare, Loader2, RotateCcw, X } from "lucide-react";
import { useWorkspace } from "./store";
import { FileIcon } from "./explorer";
import { configureMonaco, languageFor, syncModels } from "./monaco-setup";
import { editorBus } from "./editor-bus";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const listeners = new Set<(p: { line: number; col: number }) => void>();
let cursor = { line: 1, col: 1 };
export function subscribeCursor(fn: (p: { line: number; col: number }) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> Loading editor…
    </div>
  );
}

export function EditorArea() {
  const { resolvedTheme } = useTheme();
  const files = useWorkspace((s) => s.files);
  const starter = useWorkspace((s) => s.starter);
  const openTabs = useWorkspace((s) => s.openTabs);
  const active = useWorkspace((s) => s.active);
  const setActive = useWorkspace((s) => s.setActive);
  const closeTab = useWorkspace((s) => s.closeTab);
  const updateFile = useWorkspace((s) => s.updateFile);
  const openDiff = useWorkspace((s) => s.openDiff);
  const resetFile = useWorkspace((s) => s.resetFile);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
  const theme = resolvedTheme === "light" ? "ctp-latte" : "ctp-mocha";

  useEffect(() => {
    if (monacoRef.current) syncModels(monacoRef.current, files);
  }, [files]);

  useEffect(
    () =>
      editorBus.register((path, line) => {
        const ed = editorRef.current;
        if (!ed) return;
        setTimeout(() => {
          ed.revealLineInCenter(line);
          ed.setPosition({ lineNumber: line, column: 1 });
          ed.focus();
        }, 30);
      }),
    [],
  );

  const isDiff = active?.startsWith("diff:");
  const path = isDiff ? active!.slice(5) : active;
  const changed = path ? starter[path] !== files[path] : false;

  return (
    <div className="flex h-full flex-col bg-ctp-base">
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b bg-ctp-mantle [scrollbar-width:none]">
        {openTabs.map((t) => {
          const diff = t.startsWith("diff:");
          const p = diff ? t.slice(5) : t;
          const dirty = starter[p] !== files[p];
          return (
            <div
              key={t}
              onClick={() => setActive(t)}
              onAuxClick={(e) => e.button === 1 && closeTab(t)}
              className={cn(
                "group flex cursor-pointer items-center gap-1.5 border-r px-3 text-[12.5px] whitespace-nowrap",
                active === t ? "border-t-2 border-t-ctp-mauve bg-ctp-base text-foreground" : "border-t-2 border-t-transparent text-muted-foreground hover:bg-ctp-surface0/40",
              )}
            >
              {diff ? <GitCompare className="size-3.5 text-ctp-peach" /> : <FileIcon path={p} />}
              <span>{p.split("/").pop()}{diff && " (diff)"}</span>
              {dirty && !diff && <span className="size-1.5 rounded-full bg-ctp-yellow group-hover:hidden" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t);
                }}
                className={cn("rounded p-0.5 hover:bg-ctp-surface1", dirty && !diff ? "hidden group-hover:block" : "opacity-0 group-hover:opacity-100", active === t && "opacity-100")}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      {path && (
        <div className="flex h-7 shrink-0 items-center gap-1 border-b px-3 font-mono text-[11px] text-muted-foreground">
          {path.split("/").map((seg, i, arr) => (
            <span key={i} className={i === arr.length - 1 ? "text-foreground" : ""}>
              {seg}
              {i < arr.length - 1 && <span className="mx-1 text-ctp-overlay0">›</span>}
            </span>
          ))}
          {changed && !isDiff && (
            <div className="ml-auto flex gap-1">
              <Tooltip>
                <TooltipTrigger render={<button onClick={() => openDiff(path)} className="rounded p-1 hover:bg-ctp-surface0" />}>
                  <GitCompare className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>Compare with starter</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={() => confirm(`Revert ${path} to the starter version?`) && resetFile(path)}
                      className="rounded p-1 hover:bg-ctp-surface0"
                    />
                  }
                >
                  <RotateCcw className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>Revert file</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {!path ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>Open a file from the explorer, or ask the agent.</p>
            <p className="text-xs">
              <kbd className="rounded border px-1">⌘</kbd> <kbd className="rounded border px-1">Enter</kbd> sends to agent ·{" "}
              <kbd className="rounded border px-1">⌘</kbd> <kbd className="rounded border px-1">&apos;</kbd> runs tests
            </p>
          </div>
        ) : isDiff ? (
          <DiffEditor
            key={active}
            theme={theme}
            loading={<Loading />}
            original={starter[path] ?? ""}
            modified={files[path] ?? ""}
            language={languageFor(path)}
            originalModelPath={`file:///__original__/${path}`}
            modifiedModelPath={`file:///__diffmod__/${path}`}
            beforeMount={configureMonaco}
            options={{ readOnly: true, renderSideBySide: true, fontSize: 13, fontFamily: "var(--font-jetbrains), monospace", minimap: { enabled: false }, scrollBeyondLastLine: false }}
          />
        ) : (
          <Editor
            theme={theme}
            loading={<Loading />}
            path={`file:///${path}`}
            defaultLanguage={languageFor(path)}
            value={files[path] ?? ""}
            beforeMount={(m) => {
              configureMonaco(m);
              monacoRef.current = m;
              syncModels(m, useWorkspace.getState().files);
            }}
            onMount={(ed) => {
              editorRef.current = ed;
              ed.onDidChangeCursorPosition((e) => {
                cursor = { line: e.position.lineNumber, col: e.position.column };
                listeners.forEach((l) => l(cursor));
              });
            }}
            onChange={(v) => {
              const cur = useWorkspace.getState().active;
              if (cur && !cur.startsWith("diff:") && v !== undefined && v !== useWorkspace.getState().files[cur]) updateFile(cur, v, "user");
            }}
            options={{
              fontSize: 13,
              fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
              fontLigatures: true,
              minimap: { enabled: true, scale: 1, renderCharacters: false },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              renderLineHighlight: "all",
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              padding: { top: 8 },
              tabSize: 2,
              automaticLayout: true,
              stickyScroll: { enabled: true },
            }}
          />
        )}
      </div>
    </div>
  );
}
