// Shared test runner. Runs a virtual TypeScript project (Record<path, source>)
// with a tiny CommonJS loader and a jest/vitest-compatible test API.
// Used by the browser Web Worker and by the Node content verifier.
//
// Test files may import from "testkit", "vitest", "@jest/globals" or "bun:test",
// or rely on jest-style globals (describe/it/expect/vi/jest).

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

const EXTS = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs", ".jsx", ".json", "/index.ts", "/index.tsx", "/index.mts", "/index.js", "/index.mjs"];
const TEST_TIMEOUT_MS = 2000;
const MAX_LOGS = 400;

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
const realSetInterval = globalThis.setInterval.bind(globalThis);
const realClearInterval = globalThis.clearInterval.bind(globalThis);
const RealDate = globalThis.Date;

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

// ---------------------------------------------------------------- formatting

function fmt(v: unknown, depth = 0): string {
  if (typeof v === "string") return depth === 0 ? v : JSON.stringify(v);
  if (v instanceof Asymmetric) return v.toString();
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "symbol") return v.toString();
  if (v === undefined) return "undefined";
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  if (v instanceof Map) return `Map(${fmt([...v.entries()], depth + 1)})`;
  if (v instanceof Set) return `Set(${fmt([...v.values()], depth + 1)})`;
  if (v instanceof RegExp) return String(v);
  try {
    const s = JSON.stringify(v, (_k, x) =>
      typeof x === "bigint" ? `${x}n` : x === undefined ? "__undef__" : x instanceof Asymmetric ? x.toString() : typeof x === "function" ? `[Function ${x.name}]` : x,
    );
    if (s === undefined) return String(v);
    const t = s.replace(/"__undef__"/g, "undefined");
    return t.length > 400 ? t.slice(0, 400) + "…" : t;
  } catch {
    return String(v);
  }
}

// ---------------------------------------------------------------- asymmetric matchers

class Asymmetric {
  constructor(
    private readonly name: string,
    private readonly fn: (x: unknown) => boolean,
  ) {}
  asymmetricMatch(x: unknown) {
    return this.fn(x);
  }
  toString() {
    return this.name;
  }
}

function typeMatches(x: unknown, ctor: unknown) {
  if (ctor === String) return typeof x === "string" || x instanceof String;
  if (ctor === Number) return typeof x === "number" || x instanceof Number;
  if (ctor === Boolean) return typeof x === "boolean" || x instanceof Boolean;
  if (ctor === BigInt) return typeof x === "bigint";
  if (ctor === Symbol) return typeof x === "symbol";
  if (ctor === Function) return typeof x === "function";
  if (ctor === Object) return typeof x === "object" && x !== null;
  return x instanceof (ctor as new () => unknown);
}

// ---------------------------------------------------------------- equality

function deepEqual(a: unknown, b: unknown, strict = false, seen = new Map<unknown, unknown>()): boolean {
  if (b instanceof Asymmetric) return b.asymmetricMatch(a);
  if (a instanceof Asymmetric) return a.asymmetricMatch(b);
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return String(a) === String(b);
  if (a instanceof Error && b instanceof Error) return a.message === b.message && a.name === b.name;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k), strict, seen)) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    outer: for (const v of a) {
      if (b.has(v)) continue;
      for (const w of b) if (deepEqual(v, w, strict, seen)) continue outer;
      return false;
    }
    return true;
  }
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const x = a as unknown as ArrayLike<unknown>;
    const y = b as unknown as ArrayLike<unknown>;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const keys = (o: object) =>
    [...Object.keys(o), ...Object.getOwnPropertySymbols(o).filter((s) => Object.prototype.propertyIsEnumerable.call(o, s))].filter(
      (k) => strict || (o as Record<PropertyKey, unknown>)[k] !== undefined,
    );
  const ka = keys(a as object);
  const kb = keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of kb) {
    if (strict && !(k in (a as object))) return false;
    if (!deepEqual((a as Record<PropertyKey, unknown>)[k], (b as Record<PropertyKey, unknown>)[k], strict, seen)) return false;
  }
  return true;
}

function matchesObject(actual: unknown, expected: unknown): boolean {
  if (expected instanceof Asymmetric) return expected.asymmetricMatch(actual);
  if (typeof expected !== "object" || expected === null) return deepEqual(actual, expected);
  if (typeof actual !== "object" || actual === null) return false;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matchesObject(actual[i], e));
  }
  if (expected instanceof Date || expected instanceof Map || expected instanceof Set || expected instanceof RegExp) return deepEqual(actual, expected);
  return Object.entries(expected).every(([k, v]) => matchesObject((actual as Record<string, unknown>)[k], v));
}

// ---------------------------------------------------------------- mocks

interface MockState {
  calls: unknown[][];
  results: { type: "return" | "throw"; value: unknown }[];
  instances: unknown[];
  lastCall?: unknown[];
}

type MockFn = ((...args: unknown[]) => unknown) & {
  _isMockFunction: true;
  mock: MockState;
  [k: string]: unknown;
};

const allMocks = new Set<MockFn>();

function createMock(impl?: (...args: unknown[]) => unknown, original?: { obj: Record<PropertyKey, unknown>; key: PropertyKey; value: unknown }): MockFn {
  let defaultImpl = impl;
  const once: ((...args: unknown[]) => unknown)[] = [];
  let name = "vi.fn()";
  const state: MockState = { calls: [], results: [], instances: [] };
  const fn = function (this: unknown, ...args: unknown[]) {
    state.calls.push(args);
    state.lastCall = args;
    state.instances.push(this);
    const use = once.length ? once.shift() : defaultImpl;
    try {
      const value = use ? use.apply(this, args) : undefined;
      state.results.push({ type: "return", value });
      return value;
    } catch (e) {
      state.results.push({ type: "throw", value: e });
      throw e;
    }
  } as unknown as MockFn;
  Object.assign(fn, {
    _isMockFunction: true,
    mock: state,
    getMockName: () => name,
    mockName: (n: string) => ((name = n), fn),
    mockImplementation: (f: (...a: unknown[]) => unknown) => ((defaultImpl = f), fn),
    mockImplementationOnce: (f: (...a: unknown[]) => unknown) => (once.push(f), fn),
    mockReturnValue: (v: unknown) => ((defaultImpl = () => v), fn),
    mockReturnValueOnce: (v: unknown) => (once.push(() => v), fn),
    mockResolvedValue: (v: unknown) => ((defaultImpl = () => Promise.resolve(v)), fn),
    mockResolvedValueOnce: (v: unknown) => (once.push(() => Promise.resolve(v)), fn),
    mockRejectedValue: (v: unknown) => ((defaultImpl = () => Promise.reject(v)), fn),
    mockRejectedValueOnce: (v: unknown) => (once.push(() => Promise.reject(v)), fn),
    mockReturnThis: () => ((defaultImpl = function (this: unknown) { return this; }), fn),
    getMockImplementation: () => defaultImpl,
    mockClear: () => {
      state.calls.length = 0;
      state.results.length = 0;
      state.instances.length = 0;
      state.lastCall = undefined;
      return fn;
    },
    mockReset: () => {
      (fn.mockClear as () => void)();
      defaultImpl = undefined;
      once.length = 0;
      return fn;
    },
    mockRestore: () => {
      (fn.mockReset as () => void)();
      if (original) original.obj[original.key] = original.value;
      return fn;
    },
  });
  allMocks.add(fn);
  return fn;
}

function spyOn(obj: Record<PropertyKey, unknown>, key: PropertyKey, accessor?: "get" | "set") {
  if (accessor) {
    const desc = Object.getOwnPropertyDescriptor(obj, key) ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), key);
    const orig = desc?.[accessor] as ((...a: unknown[]) => unknown) | undefined;
    const m = createMock(orig);
    Object.defineProperty(obj, key, { ...desc, configurable: true, [accessor]: m });
    return m;
  }
  const value = obj[key];
  if (typeof value !== "function") throw new Error(`Cannot spy on ${String(key)}: not a function`);
  const m = createMock(function (this: unknown, ...a: unknown[]) {
    return (value as (...x: unknown[]) => unknown).apply(this, a);
  }, { obj, key, value });
  obj[key] = m;
  return m;
}

function isMock(x: unknown): x is MockFn {
  return typeof x === "function" && (x as MockFn)._isMockFunction === true;
}

// ---------------------------------------------------------------- fake timers

interface Timer {
  id: number;
  at: number;
  fn: (...a: unknown[]) => unknown;
  args: unknown[];
  interval?: number;
}

class FakeClock {
  now: number;
  timers = new Map<number, Timer>();
  nextId = 1;
  installed = false;
  constructor() {
    this.now = RealDate.now();
  }
  install() {
    if (this.installed) return;
    this.installed = true;
    const g = globalThis as Record<string, unknown>;
    g.setTimeout = (fn: () => unknown, ms = 0, ...args: unknown[]) => this.add(fn, ms, args);
    g.setInterval = (fn: () => unknown, ms = 0, ...args: unknown[]) => this.add(fn, ms, args, Math.max(1, ms));
    g.clearTimeout = g.clearInterval = (id: number | { id: number }) => this.timers.delete(typeof id === "object" && id ? id.id : (id as number));
    g.setImmediate = (fn: () => unknown, ...args: unknown[]) => this.add(fn, 0, args);
    g.clearImmediate = g.clearTimeout;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const clock = this;
    class MockDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(clock.now);
        else super(...(args as [string]));
      }
      static now() {
        return clock.now;
      }
    }
    g.Date = MockDate;
  }
  uninstall() {
    if (!this.installed) return;
    this.installed = false;
    const g = globalThis as Record<string, unknown>;
    g.setTimeout = realSetTimeout;
    g.clearTimeout = realClearTimeout;
    g.setInterval = realSetInterval;
    g.clearInterval = realClearInterval;
    g.Date = RealDate;
    this.timers.clear();
  }
  add(fn: (...a: unknown[]) => unknown, ms: number, args: unknown[], interval?: number) {
    const id = this.nextId++;
    this.timers.set(id, { id, at: this.now + Math.max(0, Number(ms) || 0), fn, args, interval });
    return id;
  }
  next(limit = Infinity) {
    let best: Timer | null = null;
    for (const t of this.timers.values()) if (t.at <= limit && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) best = t;
    return best;
  }
  fire(t: Timer) {
    this.now = Math.max(this.now, t.at);
    if (t.interval) t.at += t.interval;
    else this.timers.delete(t.id);
    t.fn(...t.args);
  }
  advance(ms: number) {
    const target = this.now + ms;
    let guard = 0;
    for (let t = this.next(target); t && guard++ < 100_000; t = this.next(target)) this.fire(t);
    this.now = target;
  }
  async advanceAsync(ms: number) {
    const target = this.now + ms;
    let guard = 0;
    for (let t = this.next(target); t && guard++ < 100_000; t = this.next(target)) {
      this.fire(t);
      await flushMicrotasks();
    }
    this.now = target;
    await flushMicrotasks();
  }
  runAll() {
    let guard = 0;
    for (let t = this.next(); t && guard++ < 10_000; t = this.next()) this.fire(t);
  }
  async runAllAsync() {
    let guard = 0;
    for (let t = this.next(); t && guard++ < 10_000; t = this.next()) {
      this.fire(t);
      await flushMicrotasks();
    }
  }
  runPending() {
    const pending = [...this.timers.values()].sort((a, b) => a.at - b.at || a.id - b.id);
    for (const t of pending) if (this.timers.has(t.id)) this.fire(t);
  }
}

async function flushMicrotasks() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

// ---------------------------------------------------------------- expect

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

type MatcherResult = { pass: boolean; message: () => string };
type CustomMatcher = (this: unknown, received: unknown, ...args: unknown[]) => MatcherResult | Promise<MatcherResult>;

function callsLabel(m: MockFn) {
  return m.mock.calls.length ? `calls: ${fmt(m.mock.calls, 1)}` : "it was never called";
}

function makeExpect() {
  const custom: Record<string, CustomMatcher> = {};

  function build(actual: unknown, negate: boolean, mode: "sync" | "resolves" | "rejects") {
    const check = (ok: boolean, msg: string) => {
      if (ok === negate) throw new AssertionError(negate ? `Expected NOT: ${msg}` : msg);
    };
    const mockOf = () => {
      if (!isMock(actual)) throw new AssertionError(`${fmt(actual, 1)} is not a mock function`);
      return actual;
    };
    const throwCheck = (expected: unknown) => {
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
        else if (expected instanceof Error) ok = msg === expected.message;
        else if (expected instanceof Asymmetric) ok = expected.asymmetricMatch(err);
        else if (typeof expected === "object" && expected) ok = matchesObject(err, expected);
      }
      check(ok, threw ? `expected error matching ${fmt(expected, 1)}, got "${msg}"` : `expected function to throw`);
    };
    const calledWith = (call: unknown[] | undefined, args: unknown[]) => !!call && deepEqual(call, args);

    const matchers: Record<string, (...args: unknown[]) => void> = {
      toBe: (e) => check(Object.is(actual, e), `expected ${fmt(actual, 1)} to be ${fmt(e, 1)}`),
      toEqual: (e) => check(deepEqual(actual, e), `expected ${fmt(actual, 1)} to equal ${fmt(e, 1)}`),
      toStrictEqual: (e) => check(deepEqual(actual, e, true), `expected ${fmt(actual, 1)} to strictly equal ${fmt(e, 1)}`),
      toMatchObject: (e) => check(matchesObject(actual, e), `expected ${fmt(actual, 1)} to match object ${fmt(e, 1)}`),
      toBeTruthy: () => check(!!actual, `expected ${fmt(actual, 1)} to be truthy`),
      toBeFalsy: () => check(!actual, `expected ${fmt(actual, 1)} to be falsy`),
      toBeNull: () => check(actual === null, `expected ${fmt(actual, 1)} to be null`),
      toBeUndefined: () => check(actual === undefined, `expected ${fmt(actual, 1)} to be undefined`),
      toBeDefined: () => check(actual !== undefined, `expected value to be defined`),
      toBeNaN: () => check(Number.isNaN(actual), `expected ${fmt(actual, 1)} to be NaN`),
      toBeTypeOf: (t) => check(typeof actual === t, `expected typeof ${fmt(actual, 1)} to be ${t}`),
      toBeInstanceOf: (c) => check(actual instanceof (c as new () => unknown), `expected value to be instance of ${(c as { name?: string }).name}`),
      toBeOneOf: (list) => check((list as unknown[]).some((x) => deepEqual(actual, x)), `expected ${fmt(actual, 1)} to be one of ${fmt(list, 1)}`),
      toSatisfy: (pred) => check(!!(pred as (x: unknown) => boolean)(actual), `expected ${fmt(actual, 1)} to satisfy predicate`),
      toBeGreaterThan: (n) => check((actual as number) > (n as number), `expected ${fmt(actual, 1)} > ${fmt(n, 1)}`),
      toBeGreaterThanOrEqual: (n) => check((actual as number) >= (n as number), `expected ${fmt(actual, 1)} >= ${fmt(n, 1)}`),
      toBeLessThan: (n) => check((actual as number) < (n as number), `expected ${fmt(actual, 1)} < ${fmt(n, 1)}`),
      toBeLessThanOrEqual: (n) => check((actual as number) <= (n as number), `expected ${fmt(actual, 1)} <= ${fmt(n, 1)}`),
      toBeCloseTo: (n, digits = 2) =>
        check(Math.abs((actual as number) - (n as number)) < Math.pow(10, -(digits as number)) / 2, `expected ${fmt(actual, 1)} to be close to ${fmt(n, 1)}`),
      toContain: (item) => {
        const ok =
          typeof actual === "string"
            ? actual.includes(item as string)
            : actual instanceof Set
              ? actual.has(item)
              : actual != null && typeof (actual as Iterable<unknown>)[Symbol.iterator] === "function"
                ? [...(actual as Iterable<unknown>)].includes(item)
                : false;
        check(ok, `expected ${fmt(actual, 1)} to contain ${fmt(item, 1)}`);
      },
      toContainEqual: (item) => check(Array.isArray(actual) && actual.some((x) => deepEqual(x, item)), `expected ${fmt(actual, 1)} to contain equal ${fmt(item, 1)}`),
      toHaveLength: (n) => check((actual as { length?: number })?.length === n, `expected length ${(actual as { length?: number })?.length} to be ${n}`),
      toHaveProperty: (key, ...rest) => {
        const parts = Array.isArray(key) ? key.map(String) : String(key).replace(/\[(\w+)\]/g, ".$1").split(".");
        let cur: unknown = actual;
        let has = true;
        for (const p of parts) {
          if (cur !== null && cur !== undefined && p in Object(cur)) cur = (cur as Record<string, unknown>)[p];
          else {
            has = false;
            break;
          }
        }
        const ok = has && (rest.length === 0 || deepEqual(cur, rest[0]));
        check(ok, `expected ${fmt(actual, 1)} to have property ${String(key)}${rest.length ? ` = ${fmt(rest[0], 1)}` : ""}`);
      },
      toMatch: (re) => {
        const ok = typeof actual === "string" && (re instanceof RegExp ? re.test(actual) : actual.includes(re as string));
        check(ok, `expected ${fmt(actual, 1)} to match ${String(re)}`);
      },
      toThrow: throwCheck,
      toThrowError: throwCheck,
      toHaveBeenCalled: () => check(mockOf().mock.calls.length > 0, `expected mock to have been called`),
      toHaveBeenCalledTimes: (n) => check(mockOf().mock.calls.length === n, `expected mock to be called ${n} times, got ${mockOf().mock.calls.length}`),
      toHaveBeenCalledOnce: () => check(mockOf().mock.calls.length === 1, `expected mock to be called once, got ${mockOf().mock.calls.length}`),
      toHaveBeenCalledWith: (...args) => check(mockOf().mock.calls.some((c) => calledWith(c, args)), `expected mock to be called with ${fmt(args, 1)}; ${callsLabel(mockOf())}`),
      toHaveBeenLastCalledWith: (...args) => check(calledWith(mockOf().mock.lastCall, args), `expected last call with ${fmt(args, 1)}; ${callsLabel(mockOf())}`),
      toHaveBeenNthCalledWith: (n, ...args) => check(calledWith(mockOf().mock.calls[(n as number) - 1], args), `expected call #${n} with ${fmt(args, 1)}; ${callsLabel(mockOf())}`),
      toHaveBeenCalledExactlyOnceWith: (...args) =>
        check(mockOf().mock.calls.length === 1 && calledWith(mockOf().mock.calls[0], args), `expected exactly one call with ${fmt(args, 1)}; ${callsLabel(mockOf())}`),
      toHaveNthReturnedWith: (n, v) => {
        const r = mockOf().mock.results[(n as number) - 1];
        check(!!r && r.type === "return" && deepEqual(r.value, v), `expected return #${n} to be ${fmt(v, 1)}`);
      },
      toHaveReturned: () => check(mockOf().mock.results.some((r) => r.type === "return"), `expected mock to have returned`),
      toHaveReturnedTimes: (n) => check(mockOf().mock.results.filter((r) => r.type === "return").length === n, `expected mock to return ${n} times`),
      toHaveReturnedWith: (v) => check(mockOf().mock.results.some((r) => r.type === "return" && deepEqual(r.value, v)), `expected mock to return ${fmt(v, 1)}`),
      toHaveLastReturnedWith: (v) => {
        const r = mockOf().mock.results.at(-1);
        check(!!r && r.type === "return" && deepEqual(r.value, v), `expected last return ${fmt(v, 1)}`);
      },
      toMatchSnapshot: () => {
        throw new AssertionError("Snapshot assertions are not supported in this sandbox");
      },
      toMatchInlineSnapshot: (snap) => {
        if (snap === undefined) throw new AssertionError("Snapshot assertions are not supported in this sandbox");
        const norm = (s: string) => s.replace(/\s+/g, " ").replace(/^"|"$/g, "").trim();
        const actualStr = typeof actual === "string" ? actual : fmt(actual, 1);
        check(norm(actualStr) === norm(String(snap)), `expected ${actualStr} to match inline snapshot ${snap}`);
      },
      toThrowErrorMatchingInlineSnapshot: (snap) => throwCheck(snap === undefined ? undefined : String(snap).replace(/^\s*"|"\s*$/g, "").trim()),
    };
    // jest aliases
    matchers.toBeCalled = matchers.toHaveBeenCalled;
    matchers.toBeCalledTimes = matchers.toHaveBeenCalledTimes;
    matchers.toBeCalledWith = matchers.toHaveBeenCalledWith;
    matchers.lastCalledWith = matchers.toHaveBeenLastCalledWith;
    matchers.nthCalledWith = matchers.toHaveBeenNthCalledWith;
    matchers.toReturn = matchers.toHaveReturned;
    matchers.toReturnWith = matchers.toHaveReturnedWith;
    for (const [name, m] of Object.entries(custom)) {
      matchers[name] = (...args) => {
        const r = m.call({ isNot: negate, equals: deepEqual }, actual, ...args) as MatcherResult;
        if (r.pass === negate) throw new AssertionError(r.message());
      };
    }
    return matchers;
  }

  function expect(actual: unknown) {
    const api: Record<string, unknown> = { ...build(actual, false, "sync") };
    api.not = build(actual, true, "sync");
    const wrapAsync = (mode: "resolves" | "rejects") => {
      const mk = (negate: boolean) => {
        const out: Record<string, unknown> = {};
        for (const name of Object.keys(build(undefined, false, mode))) {
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
      return { ...mk(false), not: mk(true) };
    };
    api.resolves = wrapAsync("resolves");
    api.rejects = wrapAsync("rejects");
    return api;
  }

  const asym = {
    any: (c: unknown) => new Asymmetric(`Any<${(c as { name?: string })?.name}>`, (x) => typeMatches(x, c)),
    anything: () => new Asymmetric("Anything", (x) => x !== null && x !== undefined),
    objectContaining: (o: object) => new Asymmetric(`ObjectContaining ${fmt(o, 1)}`, (x) => matchesObject(x, o)),
    arrayContaining: (arr: unknown[]) => new Asymmetric(`ArrayContaining ${fmt(arr, 1)}`, (x) => Array.isArray(x) && arr.every((e) => x.some((y) => deepEqual(y, e)))),
    stringContaining: (s: string) => new Asymmetric(`StringContaining "${s}"`, (x) => typeof x === "string" && x.includes(s)),
    stringMatching: (r: RegExp | string) => new Asymmetric(`StringMatching ${r}`, (x) => typeof x === "string" && (typeof r === "string" ? new RegExp(r) : r).test(x)),
    toBeOneOf: (list: unknown[]) => new Asymmetric(`OneOf ${fmt(list, 1)}`, (x) => list.some((y) => deepEqual(x, y))),
    closeTo: (n: number, d = 2) => new Asymmetric(`CloseTo ${n}`, (x) => typeof x === "number" && Math.abs(x - n) < Math.pow(10, -d) / 2),
  };
  const not = {
    objectContaining: (o: object) => new Asymmetric(`not.ObjectContaining`, (x) => !matchesObject(x, o)),
    arrayContaining: (arr: unknown[]) => new Asymmetric(`not.ArrayContaining`, (x) => !(Array.isArray(x) && arr.every((e) => x.some((y) => deepEqual(y, e))))),
    stringContaining: (s: string) => new Asymmetric(`not.StringContaining`, (x) => !(typeof x === "string" && x.includes(s))),
    stringMatching: (r: RegExp | string) => new Asymmetric(`not.StringMatching`, (x) => !(typeof x === "string" && (typeof r === "string" ? new RegExp(r) : r).test(x))),
  };
  return Object.assign(expect, asym, {
    not,
    extend: (m: Record<string, CustomMatcher>) => Object.assign(custom, m),
    assertions: () => undefined,
    hasAssertions: () => undefined,
    soft: expect,
    unreachable: (msg?: string) => {
      throw new AssertionError(msg ?? "expected code to be unreachable");
    },
    addSnapshotSerializer: () => undefined,
  });
}

// ---------------------------------------------------------------- suites

type TestFn = (...a: unknown[]) => unknown;

interface TestCase {
  name: string;
  fn: TestFn;
  skip: boolean;
  only: boolean;
  fails: boolean;
  timeout?: number;
}

interface Suite {
  name: string;
  skip: boolean;
  only: boolean;
  tests: TestCase[];
  children: Suite[];
  beforeAll: TestFn[];
  afterAll: TestFn[];
  beforeEach: TestFn[];
  afterEach: TestFn[];
  order: (TestCase | Suite)[];
}

function newSuite(name: string, skip = false, only = false): Suite {
  return { name, skip, only, tests: [], children: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [], order: [] };
}

function formatEachName(name: string, row: unknown, index: number) {
  const args = Array.isArray(row) ? row : [row];
  let i = 0;
  let out = name.replace(/%([sdifjopO#%])/g, (m, c) => {
    if (c === "%") return "%";
    if (c === "#") return String(index);
    const v = args[i++];
    if (c === "d" || c === "i") return String(Math.trunc(Number(v)));
    if (c === "f") return String(Number(v));
    if (c === "s") return typeof v === "string" ? v : fmt(v, 1);
    return fmt(v, 1);
  });
  if (row && typeof row === "object" && !Array.isArray(row)) {
    out = out.replace(/\$([\w.]+)/g, (m, k: string) => {
      let cur: unknown = row;
      for (const p of k.split(".")) cur = (cur as Record<string, unknown>)?.[p];
      return cur === undefined ? m : typeof cur === "string" ? cur : fmt(cur, 1);
    });
  }
  return out;
}

class SkipSignal extends Error {}

function makeTestkit(root: Suite, clock: FakeClock, hooks: { resetModules: () => void }) {
  const stack: Suite[] = [root];
  const cur = () => stack[stack.length - 1];

  const addTest = (name: string, fn: TestFn | undefined, opts: Partial<TestCase> = {}) => {
    const t: TestCase = { name: String(name), fn: fn ?? (() => undefined), skip: !fn || !!opts.skip, only: !!opts.only, fails: !!opts.fails, timeout: opts.timeout };
    cur().tests.push(t);
    cur().order.push(t);
  };
  const timeoutOf = (x: unknown) => (typeof x === "number" ? x : typeof x === "object" && x && "timeout" in x ? Number((x as { timeout: number }).timeout) : undefined);

  const mkTest = (base: Partial<TestCase>) => {
    const t = (name: string, a?: unknown, b?: unknown) => {
      const fn = (typeof a === "function" ? a : b) as TestFn | undefined;
      const opts = typeof a === "function" ? b : a;
      addTest(name, fn, { ...base, timeout: timeoutOf(opts) });
    };
    const each =
      (table: unknown[]) =>
      (name: string, fn: TestFn, opts?: unknown) =>
        table.forEach((row, i) => addTest(formatEachName(name, row, i), () => (Array.isArray(row) ? fn(...row) : fn(row)), { ...base, timeout: timeoutOf(opts) }));
    return Object.assign(t, { each, for: (table: unknown[]) => (name: string, fn: TestFn) => table.forEach((row, i) => addTest(formatEachName(name, row, i), () => fn(row, {}), base)) });
  };

  const test = Object.assign(mkTest({}), {
    skip: mkTest({ skip: true }),
    only: mkTest({ only: true }),
    todo: (name: string) => addTest(name, undefined, { skip: true }),
    fails: mkTest({ fails: true }),
    concurrent: mkTest({}),
    sequential: mkTest({}),
    skipIf: (c: unknown) => (c ? mkTest({ skip: true }) : mkTest({})),
    runIf: (c: unknown) => (c ? mkTest({}) : mkTest({ skip: true })),
    extend: () => test,
  });

  const mkDescribe = (skip: boolean, only: boolean) => {
    const d = (name: unknown, a?: unknown, b?: unknown) => {
      const fn = (typeof a === "function" ? a : b) as (() => void) | undefined;
      const s = newSuite(typeof name === "function" ? name.name : String(name), skip, only);
      cur().children.push(s);
      cur().order.push(s);
      stack.push(s);
      try {
        fn?.();
      } finally {
        stack.pop();
      }
    };
    const each =
      (table: unknown[]) =>
      (name: string, fn: (...a: unknown[]) => void) =>
        table.forEach((row, i) => d(formatEachName(name, row, i), () => (Array.isArray(row) ? fn(...row) : fn(row))));
    return Object.assign(d, { each });
  };
  const describe = Object.assign(mkDescribe(false, false), {
    skip: mkDescribe(true, false),
    only: mkDescribe(false, true),
    todo: (name: string) => mkDescribe(true, false)(name, () => undefined),
    concurrent: mkDescribe(false, false),
    sequential: mkDescribe(false, false),
    skipIf: (c: unknown) => mkDescribe(!!c, false),
    runIf: (c: unknown) => mkDescribe(!c, false),
  });

  const vi = {
    fn: (impl?: TestFn) => createMock(impl),
    spyOn,
    isMockFunction: isMock,
    clearAllMocks: () => allMocks.forEach((m) => (m.mockClear as () => void)()),
    resetAllMocks: () => allMocks.forEach((m) => (m.mockReset as () => void)()),
    restoreAllMocks: () => allMocks.forEach((m) => (m.mockRestore as () => void)()),
    useFakeTimers: (opts?: { now?: number | Date }) => {
      clock.install();
      if (opts?.now !== undefined) clock.now = +opts.now;
      return vi;
    },
    useRealTimers: () => (clock.uninstall(), vi),
    isFakeTimers: () => clock.installed,
    advanceTimersByTime: (ms: number) => (clock.advance(ms), vi),
    advanceTimersByTimeAsync: async (ms: number) => (await clock.advanceAsync(ms), vi),
    advanceTimersToNextTimer: () => {
      const t = clock.next();
      if (t) clock.fire(t);
      return vi;
    },
    runAllTimers: () => (clock.runAll(), vi),
    runAllTimersAsync: async () => (await clock.runAllAsync(), vi),
    runOnlyPendingTimers: () => (clock.runPending(), vi),
    runAllTicks: () => vi,
    getTimerCount: () => clock.timers.size,
    clearAllTimers: () => (clock.timers.clear(), vi),
    setSystemTime: (t: number | Date) => ((clock.now = +t), vi),
    getRealSystemTime: () => RealDate.now(),
    getMockedSystemTime: () => (clock.installed ? new RealDate(clock.now) : null),
    mock: (id: string) => {
      throw new Error(`vi.mock("${id}") is not supported in this sandbox`);
    },
    doMock: (id: string) => {
      throw new Error(`vi.doMock("${id}") is not supported in this sandbox`);
    },
    unmock: () => undefined,
    hoisted: (f: () => unknown) => f(),
    stubGlobal: (k: string, v: unknown) => (Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }), vi),
    resetModules: () => (hooks.resetModules(), vi),
    unstubAllGlobals: () => vi,
    waitFor: async (fn: () => unknown, opts?: number | { timeout?: number; interval?: number }) => {
      const timeout = typeof opts === "number" ? opts : (opts?.timeout ?? 1000);
      const interval = typeof opts === "object" ? (opts.interval ?? 20) : 20;
      const start = RealDate.now();
      for (;;) {
        try {
          return await fn();
        } catch (e) {
          if (RealDate.now() - start > timeout) throw e;
          await new Promise((r) => realSetTimeout(r, interval));
        }
      }
    },
  };

  const noopType: unknown = new Proxy(function () {}, { get: () => noopType, apply: () => noopType });
  const expect = makeExpect();
  const kit = {
    describe,
    suite: describe,
    test,
    it: test,
    expect,
    vi,
    jest: { ...vi, requireActual: () => ({}) },
    beforeEach: (fn: TestFn) => cur().beforeEach.push(fn),
    afterEach: (fn: TestFn) => cur().afterEach.push(fn),
    beforeAll: (fn: TestFn) => cur().beforeAll.push(fn),
    afterAll: (fn: TestFn) => cur().afterAll.push(fn),
    expectTypeOf: noopType,
    assertType: () => undefined,
    onTestFinished: () => undefined,
    onTestFailed: () => undefined,
  };
  return kit;
}

// ---------------------------------------------------------------- assert shim (node:assert)

function makeAssert() {
  const fail = (m?: string) => {
    throw new AssertionError(m ?? "Assertion failed");
  };
  const assert = (v: unknown, m?: string) => void (!v && fail(m));
  return Object.assign(assert, {
    ok: assert,
    equal: (a: unknown, b: unknown, m?: string) => void (a != b && fail(m ?? `${fmt(a, 1)} == ${fmt(b, 1)}`)),
    notEqual: (a: unknown, b: unknown, m?: string) => void (a == b && fail(m ?? `${fmt(a, 1)} != ${fmt(b, 1)}`)),
    strictEqual: (a: unknown, b: unknown, m?: string) => void (!Object.is(a, b) && fail(m ?? `${fmt(a, 1)} === ${fmt(b, 1)}`)),
    notStrictEqual: (a: unknown, b: unknown, m?: string) => void (Object.is(a, b) && fail(m ?? `${fmt(a, 1)} !== ${fmt(b, 1)}`)),
    deepEqual: (a: unknown, b: unknown, m?: string) => void (!deepEqual(a, b) && fail(m ?? `${fmt(a, 1)} deepEqual ${fmt(b, 1)}`)),
    deepStrictEqual: (a: unknown, b: unknown, m?: string) => void (!deepEqual(a, b, true) && fail(m ?? `${fmt(a, 1)} deepStrictEqual ${fmt(b, 1)}`)),
    notDeepStrictEqual: (a: unknown, b: unknown, m?: string) => void (deepEqual(a, b, true) && fail(m)),
    throws: (f: () => unknown, e?: unknown) => {
      try {
        f();
      } catch (err) {
        if (e instanceof RegExp && !e.test(String((err as Error)?.message ?? err))) fail(`error did not match ${e}`);
        return;
      }
      fail("expected function to throw");
    },
    rejects: async (p: Promise<unknown> | (() => Promise<unknown>)) => {
      try {
        await (typeof p === "function" ? p() : p);
      } catch {
        return;
      }
      fail("expected promise to reject");
    },
    match: (s: string, r: RegExp) => void (!r.test(s) && fail(`${s} does not match ${r}`)),
    fail,
  });
}

// ---------------------------------------------------------------- runner

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = realSetTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        realClearTimeout(t);
        resolve(v);
      },
      (e) => {
        realClearTimeout(t);
        reject(e);
      },
    );
  });
}

function callTest(fn: TestFn, ctx: Record<string, unknown>): Promise<unknown> {
  const src = Function.prototype.toString.call(fn);
  const params = src.slice(src.indexOf("(") + 1, src.indexOf(")")).trim();
  const wantsDone = fn.length >= 1 && params !== "" && !params.startsWith("{") && !/^async\b/.test(src);
  if (wantsDone) {
    return new Promise((resolve, reject) => {
      const done = Object.assign((err?: unknown) => (err ? reject(err) : resolve(undefined)), { fail: (e: unknown) => reject(e) });
      try {
        const r = fn(done) as Promise<unknown> | undefined;
        if (r && typeof r.then === "function") r.then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
  }
  return Promise.resolve().then(() => fn(ctx));
}

export function isTestFile(path: string) {
  return /\.(test|spec)\.(ts|tsx|mts|js|mjs|jsx)$/.test(path);
}

const TESTKIT_IDS = new Set(["testkit", "vitest", "@jest/globals", "bun:test", "@vitest/runner"]);

interface Alias {
  [pkg: string]: string;
}

function readAliases(files: Record<string, string>): Alias {
  try {
    return files["steercode.json"] ? (JSON.parse(files["steercode.json"]).alias ?? {}) : {};
  } catch {
    return {};
  }
}

export async function runTests(files: Record<string, string>, testFiles: string[], transform: Transform): Promise<RunResult> {
  const started = RealDate.now();
  const logs: string[] = [];
  const errors: { file: string; message: string }[] = [];
  const results: TestResult[] = [];
  const compiled = new Map<string, string>();
  const aliases = readAliases(files);

  const pushLog =
    (level: string) =>
    (...args: unknown[]) => {
      if (logs.length < MAX_LOGS) logs.push((level === "log" ? "" : `[${level}] `) + args.map((a) => fmt(a)).join(" "));
    };
  const sandboxConsole = {
    log: pushLog("log"),
    info: pushLog("info"),
    warn: pushLog("warn"),
    error: pushLog("error"),
    debug: pushLog("debug"),
    trace: pushLog("trace"),
    dir: pushLog("log"),
    table: pushLog("log"),
    group: () => undefined,
    groupEnd: () => undefined,
    time: () => undefined,
    timeEnd: () => undefined,
    assert: (c: unknown, ...a: unknown[]) => void (!c && pushLog("error")(...a)),
  };
  const processShim = {
    env: { NODE_ENV: "test" } as Record<string, string>,
    platform: "browser",
    version: "v20.0.0",
    versions: {},
    argv: [],
    cwd: () => "/",
    nextTick: (fn: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => fn(...a)),
    emitWarning: () => undefined,
    on: () => undefined,
  };
  const assertShim = makeAssert();

  const resolveFrom = (from: string, spec: string): string => {
    let base: string;
    const alias = Object.keys(aliases)
      .sort((a, b) => b.length - a.length)
      .find((a) => spec === a || spec.startsWith(a + "/"));
    if (alias) base = normalize(aliases[alias] + spec.slice(alias.length));
    else if (spec.startsWith("/")) base = normalize(spec.slice(1));
    else base = normalize(dirname(from) + "/" + spec);
    const candidates = [base];
    const m = base.match(/^(.*)\.(m|c)?jsx?$/);
    if (m) candidates.push(m[1]);
    for (const c of candidates) {
      for (const ext of EXTS) {
        const cand = normalize(c + ext);
        if (cand in files) return cand;
      }
    }
    throw new Error(`Cannot find module '${spec}' imported from ${from}`);
  };

  for (const testFile of testFiles) {
    const clock = new FakeClock();
    const root = newSuite("");
    const cache = new Map<string, { exports: unknown }>();
    const kit = makeTestkit(root, clock, { resetModules: () => cache.clear() });
    const g = globalThis as Record<string, unknown>;
    const globalNames = ["describe", "it", "test", "expect", "vi", "jest", "beforeEach", "afterEach", "beforeAll", "afterAll", "suite", "expectTypeOf", "assertType"] as const;
    const savedGlobals = globalNames.map((n) => g[n]);
    globalNames.forEach((n) => (g[n] = (kit as Record<string, unknown>)[n]));

    const load = (path: string): unknown => {
      const hit = cache.get(path);
      if (hit) return hit.exports;
      const mod = { exports: {} as unknown };
      cache.set(path, mod);
      if (path.endsWith(".json")) {
        mod.exports = JSON.parse(files[path]);
        return mod.exports;
      }
      let code = compiled.get(path);
      if (code === undefined) {
        try {
          code = transform(files[path], path);
        } catch (e) {
          throw new Error(`Compile error in ${path}: ${e instanceof Error ? e.message : String(e)}`);
        }
        compiled.set(path, code);
      }
      const req = (spec: string) => {
        if (TESTKIT_IDS.has(spec)) return kit;
        if (spec === "expect-type") return { expectTypeOf: kit.expectTypeOf };
        if (spec === "assert" || spec === "node:assert" || spec === "node:assert/strict" || spec === "assert/strict") return Object.assign(assertShim, { default: assertShim, strict: assertShim });
        const isRelative = spec.startsWith(".") || spec.startsWith("/");
        const aliased = Object.keys(aliases).some((a) => spec === a || spec.startsWith(a + "/"));
        if (!isRelative && !aliased) throw new Error(`Package '${spec}' is not available (no external dependencies in this sandbox)`);
        return load(resolveFrom(path, spec));
      };
      const fn = new Function("require", "module", "exports", "__filename", "__dirname", "console", "process", "global", code);
      fn(req, mod, mod.exports, path, dirname(path), sandboxConsole, processShim, globalThis);
      return mod.exports;
    };

    const record = (name: string, status: TestStatus, t0: number, error?: unknown) =>
      results.push({
        file: testFile,
        name,
        status,
        durationMs: RealDate.now() - t0,
        ...(error !== undefined ? { error: error instanceof Error ? (error.name && error.name !== "Error" && error.name !== "AssertionError" ? `${error.name}: ${error.message}` : error.message) : String(error) } : {}),
      });

    try {
      load(testFile);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ file: testFile, message });
      results.push({ file: testFile, name: "(load test file)", status: "fail", error: message, durationMs: 0 });
      globalNames.forEach((n, i) => (g[n] = savedGlobals[i]));
      clock.uninstall();
      continue;
    }

    const hasOnly = (s: Suite): boolean => s.only || s.tests.some((t) => t.only) || s.children.some(hasOnly);
    const onlyMode = hasOnly(root);

    type TaskSuite = { name: string; suite?: TaskSuite };
    const runSuite = async (s: Suite, prefix: string[], before: TestFn[], after: TestFn[], skipAll: boolean, inOnly: boolean, parent?: TaskSuite) => {
      const names = s.name ? [...prefix, s.name] : prefix;
      const taskSuite: TaskSuite = { name: s.name, suite: parent };
      const skipped = skipAll || s.skip;
      const only = inOnly || s.only;
      const willRun = (t: TestCase) => !skipped && !t.skip && (!onlyMode || only || t.only);
      const anyRuns = (x: Suite): boolean => !x.skip && (x.tests.some((t) => !t.skip && (!onlyMode || only || x.only || t.only)) || x.children.some(anyRuns));
      const active = !skipped && (s.tests.some(willRun) || s.children.some(anyRuns));
      let setupError: unknown;
      if (active) {
        for (const h of s.beforeAll) {
          try {
            await withTimeout(callTest(h, {}), TEST_TIMEOUT_MS * 5);
          } catch (e) {
            setupError = e;
            break;
          }
        }
      }
      for (const item of s.order) {
        if ("order" in item) {
          await runSuite(item, names, [...before, ...s.beforeEach], [...s.afterEach, ...after], skipped || !!setupError, only, taskSuite);
          continue;
        }
        const t = item;
        const full = [...names, t.name].join(" › ");
        if (!willRun(t)) {
          results.push({ file: testFile, name: full, status: "skip", durationMs: 0 });
          continue;
        }
        const t0 = RealDate.now();
        if (setupError) {
          record(full, "fail", t0, setupError);
          continue;
        }
        const ms = t.timeout ?? TEST_TIMEOUT_MS;
        let err: unknown;
        const ctx = {
          expect: kit.expect,
          task: { name: t.name, suite: taskSuite },
          skip: () => {
            throw new SkipSignal("skipped");
          },
          onTestFinished: () => undefined,
          signal: new AbortController().signal,
        };
        try {
          for (const h of [...before, ...s.beforeEach]) await withTimeout(callTest(h, ctx), ms);
          await withTimeout(callTest(t.fn, ctx), ms);
        } catch (e) {
          err = e ?? new Error("test failed");
        }
        try {
          for (const h of [...s.afterEach, ...after]) await withTimeout(callTest(h, ctx), ms);
        } catch (e) {
          err ??= e;
        }
        if (err instanceof SkipSignal) {
          results.push({ file: testFile, name: full, status: "skip", durationMs: 0 });
          continue;
        }
        if (t.fails) record(full, err ? "pass" : "fail", t0, err ? undefined : new Error("expected test to fail"));
        else record(full, err ? "fail" : "pass", t0, err);
      }
      if (active) {
        for (const h of s.afterAll) {
          try {
            await withTimeout(callTest(h, {}), TEST_TIMEOUT_MS * 5);
          } catch (e) {
            errors.push({ file: testFile, message: `afterAll: ${(e as Error)?.message ?? e}` });
          }
        }
      }
    };

    try {
      await runSuite(root, [], [], [], false, false);
    } finally {
      clock.uninstall();
      globalNames.forEach((n, i) => (g[n] = savedGlobals[i]));
    }
  }

  return {
    tests: results,
    logs,
    errors,
    durationMs: RealDate.now() - started,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
  };
}
