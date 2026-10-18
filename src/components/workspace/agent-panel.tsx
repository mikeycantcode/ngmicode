"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useWorkspace } from "./store";
import { sendToAgent, stopAgent } from "@/lib/agent/run-agent";
import { AGENT_LIMITS, type ApiMessage, type ToolCall } from "@/lib/agent/types";
import type { TrackId } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const TIPS: Record<TrackId, string[]> = {
  sprint: [
    "Orient first: ask for a map of the modules relevant to the task.",
    "State constraints and conventions up front.",
    "Ask for a plan before edits, then verify with tests.",
  ],
  review: [
    "Read before you prompt. Form a hypothesis, then test it.",
    "Ask the agent to explain root cause, not just patch symptoms.",
    "Verify behavior is unchanged outside the fix.",
  ],
  weak: [
    "One file or function per message.",
    "Paste the exact context it needs — it forgets older messages.",
    "Check every edit; small models drift.",
  ],
  precision: [
    "Name the exact file, function and signature.",
    "Spell out edge cases, ordering, rounding and error messages.",
    "Write your spec in Notes — precision is what's graded.",
  ],
};

const SPINNER = ["✻", "✶", "✷", "✸", "✹", "✺"];

function parseArgs(c: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(c.function.arguments || "{}");
  } catch {
    return {};
  }
}

function toolHead(c: ToolCall): { name: string; arg: string; path?: string; write: boolean } {
  const a = parseArgs(c);
  const p = typeof a.path === "string" ? a.path.replace(/^\.?\//, "") : undefined;
  switch (c.function.name) {
    case "list_files":
      return { name: "List", arg: String(a.dir ?? "."), write: false };
    case "read_file":
      return { name: "Read", arg: `${p}${a.start_line ? `:${a.start_line}-${a.end_line ?? ""}` : ""}`, path: p, write: false };
    case "search":
      return { name: "Search", arg: `"${a.query}"${a.dir ? ` in ${a.dir}` : ""}`, write: false };
    case "edit_file":
      return { name: "Update", arg: p ?? "", path: p, write: true };
    case "write_file":
      return { name: "Write", arg: p ?? "", path: p, write: true };
    case "run_tests":
      return { name: "Test", arg: p ?? "all visible tests", write: false };
    default:
      return { name: c.function.name, arg: "", write: false };
  }
}

function toolSummary(c: ToolCall, result: string): string {
  if (result.startsWith("Error")) return result.split("\n")[0];
  const a = parseArgs(c);
  switch (c.function.name) {
    case "list_files":
      return `${result.split("\n").filter(Boolean).length} files`;
    case "read_file":
      return `Read ${result.split("\n").filter((l) => /^\s*\d+\|/.test(l)).length} lines`;
    case "search":
      return result === "No matches." ? "No matches" : `${result.split("\n").filter((l) => /:\d+:/.test(l)).length} matches`;
    case "edit_file": {
      const removed = String(a.old_string ?? "").split("\n").length;
      const added = String(a.new_string ?? "").split("\n").length;
      return `Updated with ${added} addition${added === 1 ? "" : "s"} and ${removed} removal${removed === 1 ? "" : "s"}`;
    }
    case "write_file":
      return `${result} (${String(a.content ?? "").split("\n").length} lines)`;
    case "run_tests":
      return result.split("\n")[0];
    default:
      return result.split("\n")[0].slice(0, 120);
  }
}

function ToolLine({ call, result }: { call: ToolCall; result?: string }) {
  const openFile = useWorkspace((s) => s.openFile);
  const openDiff = useWorkspace((s) => s.openDiff);
  const [open, setOpen] = useState(false);
  const head = toolHead(call);
  const failed = result?.startsWith("Error") || (call.function.name === "run_tests" && result && !/ 0 failed/.test(result.split("\n")[0]));
  return (
    <div className="font-mono text-[12.5px] leading-[1.6]">
      <div className="flex gap-2">
        <span className={cn(result === undefined ? "animate-pulse text-ctp-overlay1" : failed ? "text-ctp-red" : "text-ctp-green")}>⏺</span>
        <span className="min-w-0">
          <span className="font-semibold text-ctp-text">{head.name}</span>
          <span className="text-ctp-subtext0">(</span>
          <button
            className={cn("text-ctp-subtext1", head.path && "hover:text-ctp-text hover:underline")}
            onClick={() => head.path && (head.write ? openDiff(head.path) : openFile(head.path))}
          >
            {head.arg}
          </button>
          <span className="text-ctp-subtext0">)</span>
        </span>
      </div>
      {result !== undefined && (
        <div className="flex gap-2 pl-[3px] text-ctp-overlay1">
          <span className="select-none">⎿</span>
          <button onClick={() => setOpen(!open)} className={cn("min-w-0 text-left hover:text-ctp-subtext1", failed && "text-ctp-red/90")}>
            {toolSummary(call, result)}
            <span className="ml-2 text-ctp-surface2">{open ? "▾" : "▸"}</span>
          </button>
        </div>
      )}
      {open && result !== undefined && (
        <pre className="mt-1 ml-5 max-h-72 overflow-auto rounded border border-ctp-surface0 bg-ctp-mantle/60 px-2 py-1.5 text-[11.5px] whitespace-pre-wrap text-ctp-subtext0">
          {result}
        </pre>
      )}
    </div>
  );
}

function Transcript({ messages }: { messages: ApiMessage[] }) {
  const results = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of messages) if (x.role === "tool") m.set(x.tool_call_id, x.content);
    return m;
  }, [messages]);
  return (
    <>
      {messages.map((m, i) => {
        if (m.role === "tool") return null;
        if (m.role === "user") {
          const text = m.content.length > 1500 ? m.content.slice(0, 1500) + `\n… (+${m.content.length - 1500} chars)` : m.content;
          return (
            <div key={i} className="flex gap-2 font-mono text-[12.5px] leading-[1.6] text-ctp-subtext0">
              <span className="text-ctp-overlay1 select-none">&gt;</span>
              <span className="min-w-0 whitespace-pre-wrap">{text}</span>
            </div>
          );
        }
        return (
          <div key={i} className="space-y-1.5">
            {m.content && (
              <div className="flex gap-2">
                <span className="font-mono text-[12.5px] leading-[1.6] text-ctp-text select-none">⏺</span>
                <div className="prose-term min-w-0 flex-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              </div>
            )}
            {m.tool_calls?.map((c) => <ToolLine key={c.id || c.function.name} call={c} result={results.get(c.id)} />)}
          </div>
        );
      })}
    </>
  );
}

function Spinner({ status }: { status: string | null }) {
  const [i, setI] = useState(0);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 120);
    const s = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => {
      clearInterval(t);
      clearInterval(s);
    };
  }, []);
  return (
    <div className="flex gap-2 font-mono text-[12.5px] text-ctp-peach">
      <span className="w-3">{SPINNER[i % SPINNER.length]}</span>
      <span>
        {status ?? "Thinking…"} <span className="text-ctp-overlay0">({secs}s · esc to interrupt)</span>
      </span>
    </div>
  );
}

export function AgentPanel({ modelLabel, track }: { modelLabel: string; track: TrackId }) {
  const mode = useWorkspace((s) => s.mode);
  const messages = useWorkspace((s) => s.messages);
  const busy = useWorkspace((s) => s.agentBusy);
  const status = useWorkspace((s) => s.agentStatus);
  const tokens = useWorkspace((s) => s.tokens);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const limits = AGENT_LIMITS[mode];

  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "Escape" && useWorkspace.getState().agentBusy) stopAgent();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Auto-grow the prompt like a terminal input.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [draft]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    sendToAgent(text);
    setTimeout(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }), 50);
  };

  const attach = () => {
    const ws = useWorkspace.getState();
    const p = ws.active && !ws.active.startsWith("diff:") ? ws.active : null;
    if (!p) return;
    const lang = p.split(".").pop();
    setDraft((d) => `${d}${d && !d.endsWith("\n") ? "\n\n" : ""}\`${p}\`:\n\`\`\`${lang}\n${ws.files[p]}\n\`\`\`\n`);
    input.current?.focus();
  };

  return (
    <div className="dark flex h-full flex-col bg-black text-ctp-text" onClick={(e) => e.target === e.currentTarget && input.current?.focus()}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/10 px-3 font-mono text-[11.5px]">
        <span className="text-ctp-overlay1">agent</span>
        <span className="text-ctp-surface2">—</span>
        <span className="truncate text-ctp-subtext0">{modelLabel}</span>
        <span className="ml-auto text-ctp-overlay0 tabular-nums">{tokens ? `${(tokens / 1000).toFixed(1)}k tok` : ""}</span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" onClick={() => window.getSelection()?.isCollapsed && input.current?.focus()}>
        <div className="rounded-md border border-ctp-mauve/40 px-3 py-2 font-mono text-[12px] leading-[1.6]">
          <div>
            <span className="text-ctp-mauve">✻</span> <span className="font-semibold">ngmicode agent</span>
          </div>
          <div className="text-ctp-overlay1">Reads, searches, edits files and runs the visible tests. It doesn&apos;t know your task until you tell it.</div>
          {!messages.length && (
            <div className="mt-2 space-y-0.5 text-ctp-subtext0">
              {TIPS[track].map((t) => (
                <div key={t}>
                  <span className="text-ctp-overlay0">·</span> {t}
                </div>
              ))}
            </div>
          )}
        </div>
        <Transcript messages={messages} />
        {busy && <Spinner status={status} />}
      </div>

      <div className="shrink-0 px-3 pb-2">
        {limits.contextMessages > 0 && messages.length > limits.contextMessages && (
          <div className="mb-1.5 font-mono text-[11px] text-ctp-peach">⚠ context window full — older messages are forgotten</div>
        )}
        <div className="flex gap-2 rounded-md border border-white/15 px-3 py-2 font-mono text-[12.5px] focus-within:border-white/35">
          <span className="text-ctp-subtext0 select-none">&gt;</span>
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            spellCheck={false}
            placeholder={busy ? "" : "Tell the agent what to do"}
            className="block min-h-5 w-full resize-none bg-transparent leading-5 text-ctp-text caret-ctp-rosewater outline-none placeholder:text-ctp-surface2"
          />
        </div>
        <div className="mt-1 flex items-center gap-3 px-1 font-mono text-[10.5px] text-ctp-overlay0">
          <span className="truncate">⏎ send · ⇧⏎ newline · esc stop</span>
          <button onClick={attach} className="ml-auto shrink-0 hover:text-ctp-subtext1">
            + attach file
          </button>
        </div>
      </div>
    </div>
  );
}
