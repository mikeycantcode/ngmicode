import type { App } from "../../src/app";
import type { Message } from "../../src/domain/types";

export interface SeedOptions {
  channelId: string;
  authorId: string;
  count: number;
  /** Clock advance before each post. Default 1000; 0 = same-millisecond burst. */
  stepMs?: number;
  text?: (i: number) => string;
}

/** Posts `count` top-level messages through MessageService. Requires a ManualClock. */
export function seedMessages(app: App, opts: SeedOptions): Message[] {
  const clock = app.clock as { advance?: (ms: number) => number };
  if (typeof clock.advance !== "function") throw new Error("seedMessages requires a ManualClock");
  const step = opts.stepMs ?? 1000;
  const out: Message[] = [];
  for (let i = 1; i <= opts.count; i++) {
    clock.advance(step);
    out.push(app.messages.post(opts.authorId, opts.channelId, opts.text ? opts.text(i) : `msg ${i}`));
  }
  return out;
}

/** Walks every history page (newest first) by following nextCursor. */
export function collectHistory(app: App, actorId: string, channelId: string, pageSize: number): Message[] {
  const out: Message[] = [];
  let cursor: string | null = null;
  for (let pages = 0; ; pages++) {
    if (pages >= 1000) throw new Error("collectHistory: more than 1000 pages (cursor loop?)");
    const page = app.history.history(actorId, channelId, { limit: pageSize, cursor });
    out.push(...page.messages);
    if (!page.nextCursor) return out;
    cursor = page.nextCursor;
  }
}
