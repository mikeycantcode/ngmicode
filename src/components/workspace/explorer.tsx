"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, FileJson, FileText, FlaskConical } from "lucide-react";
import { changedFiles, useWorkspace } from "./store";
import { cn } from "@/lib/utils";

interface Node {
  name: string;
  path: string;
  children?: Node[];
}

function buildTree(paths: string[]): Node[] {
  const root: Node = { name: "", path: "", children: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) cur.children!.push({ name: part, path });
      else {
        let next = cur.children!.find((c) => c.children && c.name === part);
        if (!next) {
          next = { name: part, path, children: [] };
          cur.children!.push(next);
        }
        cur = next;
      }
    });
  }
  const sort = (n: Node) => {
    n.children?.sort((a, b) => (a.children ? 0 : 1) - (b.children ? 0 : 1) || a.name.localeCompare(b.name));
    n.children?.forEach(sort);
  };
  sort(root);
  return root.children!;
}

export function FileIcon({ path, className }: { path: string; className?: string }) {
  if (/\.test\.(ts|js)$/.test(path)) return <FlaskConical className={cn("size-3.5 text-ctp-green", className)} />;
  if (/\.tsx?$/.test(path)) return <FileCode2 className={cn("size-3.5 text-ctp-blue", className)} />;
  if (path.endsWith(".json")) return <FileJson className={cn("size-3.5 text-ctp-yellow", className)} />;
  return <FileText className={cn("size-3.5 text-ctp-overlay1", className)} />;
}

const STATUS_CLASS = { added: "text-ctp-green", modified: "text-ctp-yellow", deleted: "text-ctp-red" };
const STATUS_LETTER = { added: "A", modified: "M", deleted: "D" };

export function Explorer() {
  const files = useWorkspace((s) => s.files);
  const starter = useWorkspace((s) => s.starter);
  const active = useWorkspace((s) => s.active);
  const openFile = useWorkspace((s) => s.openFile);
  const touched = useWorkspace((s) => s.agentTouched);
  const tree = useMemo(() => buildTree(Object.keys(files).filter((p) => !p.startsWith("tests/hidden/"))), [files]);
  const changes = useMemo(() => Object.fromEntries(changedFiles(starter, files).map((c) => [c.path, c.status])), [starter, files]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const render = (nodes: Node[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      if (n.children) {
        const isCollapsed = collapsed[n.path] ?? depth > 1;
        const dirChanged = Object.keys(changes).some((p) => p.startsWith(n.path + "/"));
        return (
          <div key={n.path}>
            <button
              onClick={() => setCollapsed({ ...collapsed, [n.path]: !isCollapsed })}
              className="flex w-full items-center gap-1 py-[3px] pr-2 text-left text-[13px] text-ctp-subtext1 hover:bg-ctp-surface0/60"
              style={{ paddingLeft: depth * 12 + 6 }}
            >
              {isCollapsed ? <ChevronRight className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
              <span className={cn("truncate", dirChanged && "text-ctp-yellow/90")}>{n.name}</span>
            </button>
            {!isCollapsed && render(n.children, depth + 1)}
          </div>
        );
      }
      const st = changes[n.path] as keyof typeof STATUS_CLASS | undefined;
      const recent = touched[n.path] && Date.now() - touched[n.path] < 4000;
      return (
        <button
          key={n.path}
          onClick={() => openFile(n.path)}
          className={cn(
            "flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[13px] hover:bg-ctp-surface0/60",
            active === n.path ? "bg-ctp-surface0 text-foreground" : "text-ctp-subtext1",
            recent && "animate-pulse bg-ctp-mauve/15",
          )}
          style={{ paddingLeft: depth * 12 + 20 }}
        >
          <FileIcon path={n.path} />
          <span className={cn("truncate", st && STATUS_CLASS[st])}>{n.name}</span>
          {st && <span className={cn("ml-auto font-mono text-[10px]", STATUS_CLASS[st])}>{STATUS_LETTER[st]}</span>}
        </button>
      );
    });

  return <div className="py-1">{render(tree, 0)}</div>;
}
