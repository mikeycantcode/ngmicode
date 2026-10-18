// Shared test runner. Runs a virtual TypeScript project (Record<path, source>)
// with a tiny CommonJS loader and a jest-like "testkit" module.
// Used by the browser Web Worker and by the Node content verifier.

export type TestStatus = "pass" | "fail" | "skip";

export interface TestResult {
  file: string;
  name: string;
  status: TestStatus;
  error?: string;
  durationMs: number;
}

export interface RunResult {
  tests: TestResult[];
  logs: string[];
  errors: { file: string; message: string }[];
  durationMs: number;
  passed: number;
  failed: number;
}

export type Transform = (code: string, path: string) => string;

const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.js"];
const TEST_TIMEOUT_MS = 2000;
const MAX_LOGS = 400;

function dirname(p: string) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function normalize(p: string) {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function fmt(v: unknown, depth = 0): string {
  if (typeof v === "string") return depth === 0 ? v : JSON.stringify(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
  if (typeof v === "bigint") return `${v}n`;
  if (v instanceof Map) return `Map(${fmt([...v.entries()], depth + 1)})`;
  if (v instanceof Set) return `Set(${fmt([...v.values()], depth + 1)})`;
  try {
    const s = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
    if (s === undefined) return String(v);
    return s.length > 300 ? s.slice(0, 300) + "…" : s;
  } catch {
    return String(v);
  }
}

function deepEqual(a: unknown, b: unknown, seen = new Map<unknown, unknown>()): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k), seen)) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], seen)) return false;
  }
  return true;
}

function matchesObject(actual: unknown, expected: unknown): boolean {
  if (typeof expected !== "object" || expected === null) return deepEqual(actual, expected);
  if (typeof actual !== "object" || actual === null) return false;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matchesObject(actual[i], e));
  }
  return Object.entries(expected).every(([k, v]) => matchesObject((actual as Record<string, unknown>)[k], v));
}

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

function makeExpect() {
  function build(actual: unknown, negate: boolean, mode: "sync" | "resolves" | "rejects") {
    const check = (ok: boolean, msg: string) => {
      if (ok === negate) throw new AssertionError(negate ? `Expected NOT: ${msg}` : msg);
    };
    const matchers: Record<string, (...args: unknown[]) => void> = {
      toBe: (e) => check(Object.is(actual, e), `expected ${fmt(actual, 1)} to be ${fmt(e, 1)}`),
      toEqual: (e) => check(deepEqual(actual, e), `expected ${fmt(actual, 1)} to equal ${fmt(e, 1)}`),
      toStrictEqual: (e) => check(deepEqual(actual, e), `expected ${fmt(actual, 1)} to equal ${fmt(e, 1)}`),
      toMatchObject: (e) => check(matchesObject(actual, e), `expected ${fmt(actual, 1)} to match object ${fmt(e, 1)}`),
      toBeTruthy: () => check(!!actual, `expected ${fmt(actual, 1)} to be truthy`),
      toBeFalsy: () => check(!actual, `expected ${fmt(actual, 1)} to be falsy`),
      toBeNull: () => check(actual === null, `expected ${fmt(actual, 1)} to be null`),
      toBeUndefined: () => check(actual === undefined, `expected ${fmt(actual, 1)} to be undefined`),
      toBeDefined: () => check(actual !== undefined, `expected value to be defined`),
      toBeNaN: () => check(Number.isNaN(actual), `expected ${fmt(actual, 1)} to be NaN`),
      toBeInstanceOf: (c) => check(actual instanceof (c as new () => unknown), `expected value to be instance of ${(c as { name?: string }).name}`),
      toBeGreaterThan: (n) => check((actual as number) > (n as number), `expected ${fmt(actual, 1)} > ${fmt(n, 1)}`),
      toBeGreaterThanOrEqual: (n) => check((actual as number) >= (n as number), `expected ${fmt(actual, 1)} >= ${fmt(n, 1)}`),
      toBeLessThan: (n) => check((actual as number) < (n as number), `expected ${fmt(actual, 1)} < ${fmt(n, 1)}`),
      toBeLessThanOrEqual: (n) => check((actual as number) <= (n as number), `expected ${fmt(actual, 1)} <= ${fmt(n, 1)}`),
      toBeCloseTo: (n, digits = 2) =>
        check(Math.abs((actual as number) - (n as number)) < Math.pow(10, -(digits as number)) / 2, `expected ${fmt(actual, 1)} to be close to ${fmt(n, 1)}`),
      toContain: (item) => {
        const ok = typeof actual === "string" ? actual.includes(item as string) : Array.isArray(actual) ? actual.includes(item) : actual instanceof Set ? actual.has(item) : false;
        check(ok, `expected ${fmt(actual, 1)} to contain ${fmt(item, 1)}`);
      },
      toContainEqual: (item) => check(Array.isArray(actual) && actual.some((x) => deepEqual(x, item)), `expected ${fmt(actual, 1)} to contain equal ${fmt(item, 1)}`),
      toHaveLength: (n) => check((actual as { length?: number })?.length === n, `expected length ${(actual as { length?: number })?.length} to be ${n}`),
      toHaveProperty: (key, value) => {
        const parts = String(key).split(".");
        let cur: unknown = actual;
        let has = true;
        for (const p of parts) {
          if (cur !== null && typeof cur === "object" && p in (cur as object)) cur = (cur as Record<string, unknown>)[p];
          else { has = false; break; }
        }
        const ok = has && (value === undefined || deepEqual(cur, value));
        check(ok, `expected ${fmt(actual, 1)} to have property ${String(key)}${value === undefined ? "" : ` = ${fmt(value, 1)}`}`);
      },
      toMatch: (re) => {
        const ok = typeof actual === "string" && (re instanceof RegExp ? re.test(actual) : actual.includes(re as string));
        check(ok, `expected ${fmt(actual, 1)} to match ${String(re)}`);
      },
      toThrow: (expected) => {
        let threw = false;
        let err: unknown;
        if (mode === "rejects") {
          threw = true;
          err = actual;
        } else {
          try {
            (actual as () => unknown)();
          } catch (e) {
            threw = true;
            err = e;
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        let ok = threw;
        if (ok && expected !== undefined) {
          if (expected instanceof RegExp) ok = expected.test(msg);
          else if (typeof expected === "string") ok = msg.includes(expected);
          else if (typeof expected === "function") ok = err instanceof (expected as new () => unknown);
        }
        check(ok, threw ? `expected error matching ${String(expected)}, got "${msg}"` : `expected function to throw`);
      },
    };
    return matchers;
  }

  function expect(actual: unknown) {
    const api: Record<string, unknown> = { ...build(actual, false, "sync") };
    api.not = build(actual, true, "sync");
    const wrapAsync = (mode: "resolves" | "rejects") => {
      const target: Record<string, unknown> = {};
      const mk = (negate: boolean) => {
        const names = Object.keys(build(undefined, false, mode));
        const out: Record<string, unknown> = {};
        for (const name of names) {
          out[name] = async (...args: unknown[]) => {
            let value: unknown;
            try {
              value = await (actual as Promise<unknown>);
              if (mode === "rejects") throw new AssertionError(`expected promise to reject, it resolved with ${fmt(value, 1)}`);
            } catch (e) {
              if (e instanceof AssertionError) throw e;
              if (mode === "resolves") throw new AssertionError(`expected promise to resolve, it rejected with ${fmt(e, 1)}`);
              value = e;
            }
            build(value, negate, mode)[name](...args);
          };
        }
        return out;
      };
      Object.assign(target, mk(false));
      target.not = mk(true);
      return target;
    };
    api.resolves = wrapAsync("resolves");
    api.rejects = wrapAsync("rejects");
    return api;
  }
  return expect;
}

interface TestCase {
  name: string;
  fn: () => unknown;
  skip: boolean;
  only: boolean;
  beforeEach: (() => unknown)[];
  afterEach: (() => unknown)[];
}

function makeTestkit(file: string, cases: TestCase[]) {
  const prefix: string[] = [];
  const beforeStack: (() => unknown)[][] = [[]];
  const afterStack: (() => unknown)[][] = [[]];
  const add = (name: string, fn: () => unknown, skip = false, only = false) =>
    cases.push({
      name: [...prefix, name].join(" › "),
      fn,
      skip,
      only,
      beforeEach: beforeStack.flat(),
      afterEach: afterStack.flat().reverse(),
    });
  const test = Object.assign((name: string, fn: () => unknown) => add(name, fn), {
    skip: (name: string, fn: () => unknown) => add(name, fn, true),
    only: (name: string, fn: () => unknown) => add(name, fn, false, true),
  });
  const describe = Object.assign(
    (name: string, fn: () => void) => {
      prefix.push(name);
      beforeStack.push([]);
      afterStack.push([]);
      try {
        fn();
      } finally {
        prefix.pop();
        beforeStack.pop();
        afterStack.pop();
      }
    },
    { skip: (name: string) => add(name, () => undefined, true) },
  );
  void file;
  return {
    describe,
    test,
    it: test,
    expect: makeExpect(),
    beforeEach: (fn: () => unknown) => beforeStack[beforeStack.length - 1].push(fn),
    afterEach: (fn: () => unknown) => afterStack[afterStack.length - 1].push(fn),
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function isTestFile(path: string) {
  return /\.test\.(ts|tsx|js)$/.test(path);
}

export async function runTests(
  files: Record<string, string>,
  testFiles: string[],
  transform: Transform,
): Promise<RunResult> {
  const started = Date.now();
  const logs: string[] = [];
  const errors: { file: string; message: string }[] = [];
  const results: TestResult[] = [];

  const pushLog = (level: string) => (...args: unknown[]) => {
    if (logs.length < MAX_LOGS) logs.push((level === "log" ? "" : `[${level}] `) + args.map((a) => fmt(a)).join(" "));
  };
  const sandboxConsole = { log: pushLog("log"), info: pushLog("info"), warn: pushLog("warn"), error: pushLog("error"), debug: pushLog("debug") };

  for (const testFile of testFiles) {
    const cases: TestCase[] = [];
    const testkit = makeTestkit(testFile, cases);
    const cache = new Map<string, { exports: unknown }>();

    const resolve = (from: string, spec: string): string => {
      const base = spec.startsWith("/") ? spec.slice(1) : normalize(dirname(from) + "/" + spec);
      for (const ext of EXTS) {
        const cand = normalize(base + ext);
        if (cand in files) return cand;
      }
      throw new Error(`Cannot find module '${spec}' imported from ${from}`);
    };

    const load = (path: string): unknown => {
      const hit = cache.get(path);
      if (hit) return hit.exports;
      const mod = { exports: {} as unknown };
      cache.set(path, mod);
      if (path.endsWith(".json")) {
        mod.exports = JSON.parse(files[path]);
        return mod.exports;
      }
      let code: string;
      try {
        code = transform(files[path], path);
      } catch (e) {
        throw new Error(`Compile error in ${path}: ${e instanceof Error ? e.message : String(e)}`);
      }
      const req = (spec: string) => {
        if (spec === "testkit") return testkit;
        if (!spec.startsWith(".") && !spec.startsWith("/")) throw new Error(`Package '${spec}' is not available (no external dependencies in this sandbox)`);
        return load(resolve(path, spec));
      };
      const fn = new Function("require", "module", "exports", "__filename", "__dirname", "console", code);
      fn(req, mod, mod.exports, path, dirname(path), sandboxConsole);
      return mod.exports;
    };

    try {
      load(testFile);
    } catch (e) {
      errors.push({ file: testFile, message: e instanceof Error ? e.message : String(e) });
      results.push({ file: testFile, name: "(load test file)", status: "fail", error: e instanceof Error ? e.message : String(e), durationMs: 0 });
      continue;
    }

    const hasOnly = cases.some((c) => c.only);
    for (const c of cases) {
      if (c.skip || (hasOnly && !c.only)) {
        results.push({ file: testFile, name: c.name, status: "skip", durationMs: 0 });
        continue;
      }
      const t0 = Date.now();
      try {
        for (const h of c.beforeEach) await withTimeout(Promise.resolve().then(h), TEST_TIMEOUT_MS);
        await withTimeout(Promise.resolve().then(c.fn), TEST_TIMEOUT_MS);
        for (const h of c.afterEach) await withTimeout(Promise.resolve().then(h), TEST_TIMEOUT_MS);
        results.push({ file: testFile, name: c.name, status: "pass", durationMs: Date.now() - t0 });
      } catch (e) {
        results.push({
          file: testFile,
          name: c.name,
          status: "fail",
          error: e instanceof Error ? e.message : String(e),
          durationMs: Date.now() - t0,
        });
      }
    }
  }

  return {
    tests: results,
    logs,
    errors,
    durationMs: Date.now() - started,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
  };
}
