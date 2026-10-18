"use client";

import type { RunResult } from "./core";

const RUN_TIMEOUT_MS = 20_000;

/** Runs tests in a fresh Web Worker; terminates it on timeout (infinite loops). */
export function runInWorker(files: Record<string, string>, testFiles: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({
        tests: [{ file: testFiles.join(", "), name: "(run)", status: "fail", error: `Test run exceeded ${RUN_TIMEOUT_MS / 1000}s — possible infinite loop`, durationMs: RUN_TIMEOUT_MS }],
        logs: [],
        errors: [{ file: "", message: "timeout" }],
        durationMs: RUN_TIMEOUT_MS,
        passed: 0,
        failed: 1,
      });
    }, RUN_TIMEOUT_MS);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else
        resolve({
          tests: [{ file: "", name: "(runner)", status: "fail", error: e.data.error, durationMs: 0 }],
          logs: [],
          errors: [{ file: "", message: e.data.error }],
          durationMs: Date.now() - started,
          passed: 0,
          failed: 1,
        });
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({
        tests: [{ file: "", name: "(runner)", status: "fail", error: e.message, durationMs: 0 }],
        logs: [],
        errors: [{ file: "", message: e.message }],
        durationMs: Date.now() - started,
        passed: 0,
        failed: 1,
      });
    };
    worker.postMessage({ files, testFiles });
  });
}
