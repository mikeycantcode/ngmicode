// Small promise helpers.

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
  settled: boolean;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const d: Deferred<T> = {
    promise,
    settled: false,
    resolve: (v) => {
      d.settled = true;
      resolve(v);
    },
    reject: (e) => {
      d.settled = true;
      reject(e);
    },
  };
  return d;
}

/**
 * Let pending promise chains run. Used by FakeClock between timers. 100
 * rounds is enough for the deepest chain in the worker pipeline (~40 hops).
 */
export async function flushMicrotasks(rounds = 100): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
