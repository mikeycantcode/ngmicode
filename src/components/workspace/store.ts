"use client";

import { create } from "zustand";
import type { RunResult } from "@/lib/runner/core";
import { isTestFile } from "@/lib/runner/core";
import { runInWorker } from "@/lib/runner/client";
import type { AgentMode, ApiMessage, WorkspaceEvent } from "@/lib/agent/types";

export type SidePanel = "problem" | "explorer" | "search" | "notes";
export type BottomPanel = "tests" | "console" | "changes";

export interface TestRunState {
  running: boolean;
  result: RunResult | null;
  at: number | null;
  source: "user" | "agent";
}

export interface WorkspaceState {
  slug: string;
  attemptId: string;
  mode: AgentMode;
  starter: Record<string, string>;
  files: Record<string, string>;
  openTabs: string[];
  active: string | null;
  side: SidePanel;
  bottom: BottomPanel;
  testRun: TestRunState;
  messages: ApiMessage[];
  agentBusy: boolean;
  agentStatus: string | null;
  tokens: number;
  events: WorkspaceEvent[];
  notes: string;
  /** Files the agent touched most recently (for highlighting). */
  agentTouched: Record<string, number>;

  init(p: { slug: string; attemptId: string; mode: AgentMode; starter: Record<string, string>; saved?: Partial<Persisted> }): void;
  openFile(path: string): void;
  openDiff(path: string): void;
  closeTab(path: string): void;
  setActive(path: string): void;
  setSide(p: SidePanel): void;
  setBottom(p: BottomPanel): void;
  updateFile(path: string, content: string, by: "user" | "agent"): void;
  deleteFile(path: string): void;
  resetFile(path: string): void;
  runTests(source: "user" | "agent", only?: string): Promise<RunResult>;
  setMessages(m: ApiMessage[]): void;
  setAgentBusy(b: boolean, status?: string | null): void;
  addTokens(n: number): void;
  logEvent(type: WorkspaceEvent["type"], detail: string): void;
  setNotes(n: string): void;
}

export interface Persisted {
  files: Record<string, string>;
  messages: ApiMessage[];
  events: WorkspaceEvent[];
  notes: string;
  openTabs: string[];
  active: string | null;
  tokens: number;
}

let manualEditTimer: ReturnType<typeof setTimeout> | null = null;

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  slug: "",
  attemptId: "",
  mode: "strong",
  starter: {},
  files: {},
  openTabs: [],
  active: null,
  side: "problem",
  bottom: "tests",
  testRun: { running: false, result: null, at: null, source: "user" },
  messages: [],
  agentBusy: false,
  agentStatus: null,
  tokens: 0,
  events: [],
  notes: "",
  agentTouched: {},

  init({ slug, attemptId, mode, starter, saved }) {
    const files = saved?.files ?? { ...starter };
    const firstOpen = saved?.openTabs?.length ? saved.openTabs : ["README.md" in files ? "README.md" : Object.keys(files).sort()[0]];
    set({
      slug,
      attemptId,
      mode,
      starter,
      files,
      openTabs: firstOpen.filter((p) => p in files || p.startsWith("diff:")),
      active: saved?.active && (saved.active in files || saved.active.startsWith("diff:")) ? saved.active : firstOpen[0],
      messages: saved?.messages ?? [],
      events: saved?.events ?? [],
      notes: saved?.notes ?? "",
      tokens: saved?.tokens ?? 0,
      testRun: { running: false, result: null, at: null, source: "user" },
      agentBusy: false,
      agentStatus: null,
      agentTouched: {},
    });
  },
  openFile(path) {
    const { openTabs, files } = get();
    if (!(path in files)) return;
    set({ openTabs: openTabs.includes(path) ? openTabs : [...openTabs, path], active: path });
  },
  openDiff(path) {
    const id = `diff:${path}`;
    const { openTabs } = get();
    set({ openTabs: openTabs.includes(id) ? openTabs : [...openTabs, id], active: id });
  },
  closeTab(path) {
    const { openTabs, active } = get();
    const idx = openTabs.indexOf(path);
    const next = openTabs.filter((p) => p !== path);
    set({ openTabs: next, active: active === path ? (next[Math.max(0, idx - 1)] ?? null) : active });
  },
  setActive(path) {
    set({ active: path });
  },
  setSide(side) {
    set({ side });
  },
  setBottom(bottom) {
    set({ bottom });
  },
  updateFile(path, content, by) {
    const files = { ...get().files, [path]: content };
    if (by === "agent") {
      set({ files, agentTouched: { ...get().agentTouched, [path]: Date.now() } });
    } else {
      set({ files });
      if (manualEditTimer) clearTimeout(manualEditTimer);
      manualEditTimer = setTimeout(() => get().logEvent("manual_edit", path), 1500);
    }
  },
  deleteFile(path) {
    const files = { ...get().files };
    delete files[path];
    set({ files });
    get().closeTab(path);
  },
  resetFile(path) {
    const { starter } = get();
    if (path in starter) get().updateFile(path, starter[path], "user");
    else get().deleteFile(path);
  },
  async runTests(source, only) {
    const { files } = get();
    const testFiles = only ? [only] : Object.keys(files).filter((p) => isTestFile(p) && !p.startsWith("tests/hidden/"));
    set({ testRun: { ...get().testRun, running: true, source }, bottom: source === "user" ? "tests" : get().bottom });
    const result = await runInWorker(files, testFiles);
    set({ testRun: { running: false, result, at: Date.now(), source } });
    get().logEvent("test_run", `${source}: ${result.passed} passed, ${result.failed} failed${only ? ` (${only})` : ""}`);
    return result;
  },
  setMessages(messages) {
    set({ messages });
  },
  setAgentBusy(agentBusy, agentStatus = null) {
    set({ agentBusy, agentStatus });
  },
  addTokens(n) {
    set({ tokens: get().tokens + n });
  },
  logEvent(type, detail) {
    set({ events: [...get().events, { t: Date.now(), type, detail: detail.slice(0, 500) }] });
  },
  setNotes(notes) {
    set({ notes });
  },
}));

export function changedFiles(starter: Record<string, string>, files: Record<string, string>) {
  const out: { path: string; status: "added" | "modified" | "deleted" }[] = [];
  for (const p of Object.keys(files)) {
    if (!(p in starter)) out.push({ path: p, status: "added" });
    else if (starter[p] !== files[p]) out.push({ path: p, status: "modified" });
  }
  for (const p of Object.keys(starter)) if (!(p in files)) out.push({ path: p, status: "deleted" });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
