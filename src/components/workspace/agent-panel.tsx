"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Bot, FilePen, FilePlus2, FileSearch, FlaskConical, FolderTree, Loader2, Paperclip, Search, Square, User } from "lucide-react";
import { useWorkspace } from "./store";
import { sendToAgent, stopAgent } from "@/lib/agent/run-agent";
import { AGENT_LIMITS, type AgentMode, type ApiMessage, type ToolCall } from "@/lib/agent/types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MODE_INFO: Record<AgentMode, { label: string; tip: string; cls: string }> = {
  strong: { label: "Frontier agent", tip: "Capable model with full tools. It still doesn't know the task or the codebase's traps — you do.", cls: "text-ctp-mauve bg-ctp-mauve/10" },
  weak: { label: "Weak agent", tip: "Small, older model. Short memory, few steps per turn, reads files in small chunks. Feed it context and check its work.", cls: "text-ctp-peach bg-ctp-peach/10" },
  literal: { label: "Literal agent", tip: "Does exactly what you write and nothing else. Missing details? It will stop and ask. Be precise.", cls: "text-ctp-teal bg-ctp-teal/10" },
};

const TIPS: Record<AgentMode, string[]> = {
  strong: [
    "Start by orienting: ask for an architecture summary of the modules relevant to the task.",
    "State constraints and conventions up front (money in cents, events, error types).",
    "Ask it to show the plan before editing, then verify with tests.",
  ],
  weak: [
    "Break the task into small steps — one file or function per message.",
    "Attach the exact file the change belongs in (📎) instead of letting it wander.",
    "Re-state key facts: it forgets everything older than its context window.",
  ],
  literal: [
    "Name the exact file, function and signature.",
    "Specify edge cases, ordering, rounding and error messages explicitly.",
    "Narrate your intent in Notes — precision is what's graded.",
  ],
};

function toolLabel(c: ToolCall): { icon: typeof Bot; text: string; path?: string; kind: "read" | "write" | "test" | "other" } {
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(c.function.arguments || "{}");
  } catch {}
  const p = typeof a.path === "string" ? a.path.replace(/^\.?\//, "") : undefined;
  switch (c.function.name) {
    case "list_files":
      return { icon: FolderTree, text: `List files${a.dir ? ` in ${a.dir}` : ""}`, kind: "read" };
    case "read_file":
      return { icon: FileSearch, text: `Read ${p}${a.start_line ? `:${a.start_line}-${a.end_line ?? ""}` : ""}`, path: p, kind: "read" };
    case "search":
      return { icon: Search, text: `Search "${a.query}"`, kind: "read" };
    case "edit_file":
      return { icon: FilePen, text: `Edit ${p}`, path: p, kind: "write" };
    case "write_file":
      return { icon: FilePlus2, text: `Write ${p}`, path: p, kind: "write" };
    case "run_tests":
      return { icon: FlaskConical, text: `Run tests${p ? ` ${p}` : ""}`, kind: "test" };
    default:
      return { icon: Bot, text: c.function.name, kind: "other" };
  }
}

function ToolRow({ call, result }: { call: ToolCall; result?: string }) {
  const openFile = useWorkspace((s) => s.openFile);
  const openDiff = useWorkspace((s) => s.openDiff);
  const { icon: Icon, text, path, kind } = toolLabel(call);
  const failed = result?.startsWith("Error");
  const summary = kind === "test" && result ? result.split("\n")[0] : null;
  return (
    <details className="group rounded-md border border-transparent font-mono text-[11.5px] open:border-border open:bg-ctp-crust/50">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-ctp-surface0/50">
        {result === undefined ? <Loader2 className="size-3 animate-spin" /> : <Icon className={cn("size-3", kind === "write" ? "text-ctp-peach" : kind === "test" ? "text-ctp-green" : "text-ctp-teal")} />}
        <span
          className={cn("truncate", path && "hover:text-foreground hover:underline", failed && "text-ctp-red")}
          onClick={(e) => {
            if (!path) return;
            e.preventDefault();
            if (kind === "write") openDiff(path);
            else openFile(path);
          }}
        >
          {text}
        </span>
        {summary && <span className={cn("ml-auto shrink-0", summary.includes(" 0 failed") ? "text-ctp-green" : "text-ctp-red")}>{summary.replace(/\s*\(.*\)/, "")}</span>}
      </summary>
      {result !== undefined && <pre className="max-h-64 overflow-auto px-2 pb-2 text-[11px] whitespace-pre-wrap text-ctp-subtext0">{result}</pre>}
    </details>
  );
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-ctp text-[13px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
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
          return (
            <div key={i} className="flex gap-2.5">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ctp-surface0">
                <User className="size-3.5 text-ctp-subtext1" />
              </div>
              <div className="min-w-0 flex-1 rounded-lg bg-ctp-surface0/60 px-3 py-2 text-[13px] whitespace-pre-wrap">
                {m.content.length > 1500 ? m.content.slice(0, 1500) + `\n… (${m.content.length - 1500} more chars attached)` : m.content}
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="flex gap-2.5">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ctp-mauve to-ctp-blue">
              <Bot className="size-3.5 text-ctp-crust" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {m.content && <Markdown>{m.content}</Markdown>}
              {m.tool_calls?.map((c) => <ToolRow key={c.id || c.function.name} call={c} result={results.get(c.id)} />)}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function AgentPanel({ modelLabel }: { modelLabel: string }) {
  const mode = useWorkspace((s) => s.mode);
  const messages = useWorkspace((s) => s.messages);
  const busy = useWorkspace((s) => s.agentBusy);
  const status = useWorkspace((s) => s.agentStatus);
  const tokens = useWorkspace((s) => s.tokens);
  const active = useWorkspace((s) => s.active);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const info = MODE_INFO[mode];
  const limits = AGENT_LIMITS[mode];

  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

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
    <div className="flex h-full flex-col bg-ctp-mantle">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Bot className="size-4 text-ctp-mauve" />
        <span className="text-[11px] font-medium tracking-wide uppercase">Agent</span>
        <Tooltip>
          <TooltipTrigger render={<span className={cn("cursor-help rounded px-1.5 py-0.5 text-[10.5px] font-medium", info.cls)} />}>{info.label}</TooltipTrigger>
          <TooltipContent className="max-w-64">{info.tip}</TooltipContent>
        </Tooltip>
        <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground">{modelLabel}</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {!messages.length ? (
          <div className="space-y-3 pt-4 text-[13px] text-muted-foreground">
            <p className="text-foreground">The agent can read, search, edit files and run the visible tests. It does not know your task until you tell it.</p>
            <ul className="space-y-1.5">
              {TIPS[mode].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-ctp-mauve">›</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Transcript messages={messages} />
        )}
        {busy && (
          <div className="flex items-center gap-2 pl-8 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> {status}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t p-2">
        {limits.contextMessages > 0 && messages.length > limits.contextMessages && (
          <p className="mb-1.5 rounded bg-ctp-peach/10 px-2 py-1 text-[11px] text-ctp-peach">
            The weak agent only sees the last ~{limits.contextMessages} messages. Earlier context is forgotten.
          </p>
        )}
        <div className="rounded-lg border bg-ctp-base focus-within:border-ctp-mauve/60">
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
            rows={3}
            placeholder={mode === "literal" ? "Specify exactly what to change…" : "Tell the agent what to do…  (Enter to send, Shift+Enter for newline)"}
            className="block max-h-60 min-h-16 w-full resize-y bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1 px-2 pb-1.5">
            <Tooltip>
              <TooltipTrigger
                render={<button onClick={attach} disabled={!active || active.startsWith("diff:")} className="rounded p-1 text-muted-foreground hover:bg-ctp-surface0 hover:text-foreground disabled:opacity-40" />}
              >
                <Paperclip className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Attach the active file&apos;s contents</TooltipContent>
            </Tooltip>
            <span className="text-[10.5px] text-muted-foreground tabular-nums">{tokens ? `${(tokens / 1000).toFixed(1)}k tokens` : ""}</span>
            {busy ? (
              <button onClick={stopAgent} className="ml-auto flex items-center gap-1 rounded-md bg-ctp-red/15 px-2 py-1 text-[11px] text-ctp-red hover:bg-ctp-red/25">
                <Square className="size-3 fill-current" /> Stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!draft.trim()}
                className="ml-auto flex size-7 items-center justify-center rounded-md bg-ctp-mauve text-ctp-crust transition-opacity disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
