"use client";

import { useWorkspace } from "@/components/workspace/store";
import { AGENT_LIMITS, type ApiMessage, type ToolCall } from "./types";

const MAX_TOOL_OUTPUT = 12_000;

function clip(s: string, n = MAX_TOOL_OUTPUT) {
  return s.length > n ? s.slice(0, n) + `\n… [truncated ${s.length - n} chars]` : s;
}

function normPath(p: unknown) {
  return String(p ?? "")
    .trim()
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "");
}

export async function executeTool(call: ToolCall): Promise<string> {
  const ws = useWorkspace.getState();
  const limits = AGENT_LIMITS[ws.mode];
  let args: Record<string, unknown> = {};
  try {
    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return `Error: arguments were not valid JSON: ${call.function.arguments.slice(0, 200)}`;
  }
  const files = ws.files;
  const visible = (p: string) => !p.startsWith("tests/hidden/");

  switch (call.function.name) {
    case "list_files": {
      const dir = normPath(args.dir).replace(/\/$/, "");
      const list = Object.keys(files)
        .filter(visible)
        .filter((p) => !dir || p === dir || p.startsWith(dir + "/"))
        .sort();
      return list.length ? list.join("\n") : `No files under '${dir}'.`;
    }
    case "read_file": {
      const path = normPath(args.path);
      if (!(path in files) || !visible(path)) return `Error: file not found: ${path}`;
      const lines = files[path].split("\n");
      const start = Math.max(1, Number(args.start_line) || 1);
      let end = Math.min(lines.length, Number(args.end_line) || lines.length);
      let note = "";
      if (end - start + 1 > limits.maxReadLines) {
        end = start + limits.maxReadLines - 1;
        note = `\n… [showing lines ${start}-${end} of ${lines.length}; request more with start_line/end_line]`;
      }
      ws.logEvent("tool_call", `read_file ${path}:${start}-${end}`);
      const width = String(end).length;
      return (
        lines
          .slice(start - 1, end)
          .map((l, i) => `${String(start + i).padStart(width)}| ${l}`)
          .join("\n") + note
      );
    }
    case "search": {
      const q = String(args.query ?? "");
      const dir = normPath(args.dir).replace(/\/$/, "");
      if (!q) return "Error: empty query";
      let re: RegExp | null = null;
      if (args.regex) {
        try {
          re = new RegExp(q, "i");
        } catch (e) {
          return `Error: invalid regex: ${(e as Error).message}`;
        }
      }
      const needle = q.toLowerCase();
      const hits: string[] = [];
      for (const [p, c] of Object.entries(files)) {
        if (!visible(p) || (dir && !p.startsWith(dir + "/") && p !== dir)) continue;
        c.split("\n").forEach((line, i) => {
          if (hits.length >= 80) return;
          if (re ? re.test(line) : line.toLowerCase().includes(needle)) hits.push(`${p}:${i + 1}: ${line.trim().slice(0, 200)}`);
        });
      }
      ws.logEvent("tool_call", `search "${q}"`);
      return hits.length ? hits.join("\n") + (hits.length >= 80 ? "\n… [more matches truncated]" : "") : "No matches.";
    }
    case "edit_file": {
      const path = normPath(args.path);
      if (!(path in files) || !visible(path)) return `Error: file not found: ${path}`;
      const oldS = String(args.old_string ?? "");
      const newS = String(args.new_string ?? "");
      if (!oldS) return "Error: old_string is empty";
      const count = files[path].split(oldS).length - 1;
      if (count === 0) return `Error: old_string not found in ${path}. Re-read the file and copy the exact text.`;
      if (count > 1) return `Error: old_string matches ${count} times in ${path}; include more surrounding context.`;
      ws.updateFile(path, files[path].replace(oldS, () => newS), "agent");
      ws.logEvent("tool_call", `edit_file ${path} (-${oldS.split("\n").length}/+${newS.split("\n").length} lines)`);
      return `Edited ${path}.`;
    }
    case "write_file": {
      const path = normPath(args.path);
      if (!path || path.startsWith("tests/hidden/")) return "Error: invalid path";
      const existed = path in files;
      ws.updateFile(path, String(args.content ?? ""), "agent");
      ws.logEvent("tool_call", `write_file ${path} (${existed ? "overwrite" : "new"})`);
      return `${existed ? "Overwrote" : "Created"} ${path}.`;
    }
    case "run_tests": {
      const only = args.path ? normPath(args.path) : undefined;
      if (only && !(only in files)) return `Error: test file not found: ${only}`;
      const r = await ws.runTests("agent", only);
      const fails = r.tests.filter((t) => t.status === "fail");
      return clip(
        [
          `${r.passed} passed, ${r.failed} failed (${r.durationMs}ms)`,
          ...fails.map((t) => `✗ ${t.file} › ${t.name}\n    ${t.error}`),
          r.logs.length ? `\nconsole:\n${r.logs.slice(0, 40).join("\n")}` : "",
        ].join("\n"),
        6000,
      );
    }
    default:
      return `Error: unknown tool ${call.function.name}`;
  }
}

interface StreamOutcome {
  message: Extract<ApiMessage, { role: "assistant" }>;
  tokens: number;
}

async function streamCompletion(
  attemptId: string,
  messages: ApiMessage[],
  signal: AbortSignal,
  onUpdate: (m: Extract<ApiMessage, { role: "assistant" }>) => void,
): Promise<StreamOutcome> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attemptId, messages }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      msg = JSON.parse(text).error ?? text;
    } catch {}
    throw new Error(msg || `Agent request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  const calls: { id: string; name: string; args: string }[] = [];
  let tokens = 0;
  const snapshot = (): Extract<ApiMessage, { role: "assistant" }> => ({
    role: "assistant",
    content: content || null,
    ...(calls.length
      ? { tool_calls: calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args } })) }
      : {}),
  });

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let json: {
        error?: { message?: string };
        usage?: { total_tokens?: number };
        choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new Error(json.error.message || "Model error");
      if (json.usage?.total_tokens) tokens = json.usage.total_tokens;
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) content += delta.content;
      for (const tc of delta.tool_calls ?? []) {
        const slot = (calls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
      onUpdate(snapshot());
    }
  }
  calls.forEach((c, i) => (c.id ||= `call_${Date.now()}_${i}`));
  return { message: snapshot(), tokens };
}

let controller: AbortController | null = null;

export function stopAgent() {
  controller?.abort();
  useWorkspace.getState().logEvent("stop", "user stopped the agent");
}

/** Sends a user message and runs the tool loop until the model stops calling tools. */
export async function sendToAgent(text: string) {
  const ws = useWorkspace.getState();
  if (ws.agentBusy) return;
  const limits = AGENT_LIMITS[ws.mode];
  controller = new AbortController();
  const signal = controller.signal;
  let messages: ApiMessage[] = [...ws.messages, { role: "user", content: text }];
  ws.setMessages(messages);
  ws.logEvent("user_message", text);
  ws.setAgentBusy(true, "Thinking…");

  try {
    for (let step = 0; step < limits.maxStepsPerTurn; step++) {
      const base = messages;
      const { message, tokens } = await streamCompletion(ws.attemptId, base, signal, (partial) => {
        useWorkspace.getState().setMessages([...base, partial]);
      });
      useWorkspace.getState().addTokens(tokens);
      messages = [...base, message];
      useWorkspace.getState().setMessages(messages);
      if (!message.tool_calls?.length) return;
      for (const call of message.tool_calls) {
        if (signal.aborted) throw new DOMException("aborted", "AbortError");
        useWorkspace.getState().setAgentBusy(true, `Running ${call.function.name}…`);
        const output = await executeTool(call);
        messages = [...messages, { role: "tool", tool_call_id: call.id, content: clip(output) }];
        useWorkspace.getState().setMessages(messages);
      }
      useWorkspace.getState().setAgentBusy(true, "Thinking…");
    }
    messages = [
      ...messages,
      { role: "assistant", content: `⏸ Reached the ${limits.maxStepsPerTurn}-step limit for one turn. Send a message to continue.` },
    ];
    useWorkspace.getState().setMessages(messages);
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    const st = useWorkspace.getState();
    // Drop a dangling assistant tool_call message without tool results so the history stays valid.
    let msgs = st.messages;
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant" && last.tool_calls?.length) msgs = msgs.slice(0, -1);
    st.setMessages([...msgs, { role: "assistant", content: aborted ? "⏹ Stopped." : `⚠ ${(e as Error).message}` }]);
    if (!aborted) st.logEvent("agent_error", (e as Error).message);
  } finally {
    useWorkspace.getState().setAgentBusy(false);
    controller = null;
  }
}
