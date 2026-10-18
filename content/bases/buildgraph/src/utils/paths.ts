/**
 * POSIX-style path helpers for the virtual filesystem. Workspace paths are
 * root-relative ("packages/ui/src/index.ts"); a leading "/" marks an absolute path.
 */
export function normalize(p: string): string {
  const abs = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!abs) out.push("..");
      continue;
    }
    out.push(seg);
  }
  const joined = out.join("/");
  return abs ? "/" + joined : joined;
}

export function join(...parts: string[]): string {
  return normalize(parts.filter((p) => p !== "").join("/"));
}

export function dirname(p: string): string {
  const n = normalize(p);
  const i = n.lastIndexOf("/");
  if (i < 0) return "";
  if (i === 0) return "/";
  return n.slice(0, i);
}

export function basename(p: string): string {
  const n = normalize(p);
  return n.slice(n.lastIndexOf("/") + 1);
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i) : "";
}

/** Path of `to` relative to directory `from`. Both must be root-relative. */
export function relative(from: string, to: string): string {
  const a = normalize(from).split("/").filter(Boolean);
  const b = normalize(to).split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
}

/** True if `child` is `dir` itself or lives somewhere below it. */
export function isWithin(dir: string, child: string): boolean {
  const d = normalize(dir);
  const c = normalize(child);
  if (d === "") return !c.startsWith("..") && !c.startsWith("/");
  return c === d || c.startsWith(d + "/");
}
