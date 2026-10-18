"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "./store";
import { FileIcon } from "./explorer";
import { Input } from "@/components/ui/input";
import { editorBus } from "./editor-bus";

export function SearchPanel() {
  const files = useWorkspace((s) => s.files);
  const openFile = useWorkspace((s) => s.openFile);
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out: { path: string; hits: { line: number; text: string }[] }[] = [];
    for (const [path, content] of Object.entries(files)) {
      if (path.startsWith("tests/hidden/")) continue;
      const hits: { line: number; text: string }[] = [];
      content.split("\n").forEach((l, i) => {
        if (hits.length < 30 && l.toLowerCase().includes(needle)) hits.push({ line: i + 1, text: l.trim() });
      });
      if (hits.length || path.toLowerCase().includes(needle)) out.push({ path, hits });
    }
    return out.slice(0, 60);
  }, [files, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="h-7 text-xs" />
      </div>
      <div className="flex-1 overflow-y-auto pb-2 text-[12px]">
        {results.map((r) => (
          <div key={r.path} className="mb-1">
            <button onClick={() => openFile(r.path)} className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-ctp-subtext1 hover:bg-ctp-surface0/60">
              <FileIcon path={r.path} />
              <span className="truncate">{r.path}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{r.hits.length}</span>
            </button>
            {r.hits.map((h) => (
              <button
                key={h.line}
                onClick={() => {
                  openFile(r.path);
                  setTimeout(() => editorBus.reveal(r.path, h.line), 50);
                }}
                className="block w-full truncate py-0.5 pr-2 pl-8 text-left font-mono text-[11px] text-muted-foreground hover:bg-ctp-surface0/60 hover:text-foreground"
              >
                <span className="mr-2 text-ctp-overlay0">{h.line}</span>
                {h.text}
              </button>
            ))}
          </div>
        ))}
        {q.trim().length >= 2 && !results.length && <p className="px-3 text-xs text-muted-foreground">No results.</p>}
      </div>
    </div>
  );
}
