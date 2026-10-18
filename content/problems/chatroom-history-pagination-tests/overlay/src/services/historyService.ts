import { decodeCursor, encodeCursor, type CursorPosition } from "../domain/cursor";
import type { Message } from "../domain/types";
import type { ChatConfig } from "../config";
import type { AccessService } from "../policy/access";
import type { Db } from "../storage/db";
import { ValidationError } from "../util/errors";

export interface HistoryPage {
  messages: Message[]; // newest first
  nextCursor: string | null; // pass back to get older messages
}

export interface HistoryQuery {
  limit?: number;
  cursor?: string | null;
}

export class HistoryService {
  private db: Db;
  private access: AccessService;
  private config: ChatConfig;

  constructor(deps: { db: Db; access: AccessService; config: ChatConfig }) {
    this.db = deps.db;
    this.access = deps.access;
    this.config = deps.config;
  }

  /**
   * Top-level messages of a channel, newest first, excluding deleted ones.
   * Thread replies are not part of channel history (see ThreadService).
   */
  history(actorId: string, channelId: string, query: HistoryQuery = {}): HistoryPage {
    this.access.assertRead(actorId, channelId);
    const limit = this.parseLimit(query.limit);
    let before: CursorPosition | null = null;
    if (query.cursor) {
      before = decodeCursor(query.cursor);
      if (!before) throw new ValidationError("invalid cursor", "cursor");
    }

    const positions = this.db.timeline.channel(channelId);
    const page: Message[] = [];
    let hasMore = false;
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i];
      // createdAt is unique per channel (monotonic clock), so it alone orders the page boundary.
      if (before && pos.createdAt >= before.createdAt) continue;
      const msg = this.db.messages.get(pos.id);
      if (!msg || msg.deletedAt !== null) continue;
      if (page.length === limit) {
        hasMore = true;
        break;
      }
      page.push(msg);
    }
    const last = page[page.length - 1];
    return {
      messages: page,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  private parseLimit(limit: number | undefined): number {
    if (limit === undefined) return this.config.history.defaultLimit;
    const max = this.config.history.maxLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > max) {
      throw new ValidationError(`limit must be between 1 and ${max}`, "limit");
    }
    return limit;
  }
}
