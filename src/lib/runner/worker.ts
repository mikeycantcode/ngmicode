import { runTests } from "./core";
import { sucraseTransform } from "./transform";

self.onmessage = async (e: MessageEvent<{ files: Record<string, string>; testFiles: string[] }>) => {
  const { files, testFiles } = e.data;
  try {
    const result = await runTests(files, testFiles, sucraseTransform);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
