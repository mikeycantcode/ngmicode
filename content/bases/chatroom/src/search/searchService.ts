import { renderPreview } from "../domain/preview";
import type { Message } from "../domain/types";
import type { ChatConfig } from "../config";
import type { AccessService } from "../policy/access";
import type { Db } from "../storage/db";
import type { EventBus } from "../util/events";
import { InvertedIndex } from "./textIndex";
import { parseQuery, tokenize } from "./textIndex";

export interface SearchHit {
  message: Message;
  channelName: string;
  snippet: string;
}

export interface SearchOptions {
  limit?: number;
}

export class SearchService {
  private db: Db;
  private access: AccessService;
  private config: ChatConfig;
  private index = new InvertedIndex();

  constructor(deps: { db: Db; bus: EventBus; access: AccessService; config: ChatConfig }) {
    this.db = deps.db;
    this.access = deps.access;
    this.config = deps.config;
    deps.bus.on("message.created", (e) => this.index.upsert(e.message.id, tokenize(e.message.text)));
    deps.bus.on("message.updated", (e) => this.index.upsert(e.message.id, tokenize(e.message.text)));
    deps.bus.on("message.deleted", (e) => this.index.remove(e.message.id));
  }

  get indexedCount(): number {
    return this.index.docCount;
  }

  /** Full-text search over messages the actor is allowed to read. Newest first. */
  search(actorId: string, workspaceId: string, q: string, opts: SearchOptions = {}): SearchHit[] {
    this.access.actor(workspaceId, actorId);
    const limit = Math.min(opts.limit ?? 20, this.config.search.maxResults);
    const parsed = parseQuery(q);
    const ids = this.index.query(parsed.terms);
    const fromUser = parsed.fromHandle ? this.db.users.find((u) => u.handle === parsed.fromHandle) : undefined;
    if (parsed.fromHandle && !fromUser) return [];

    const readable = new Map<string, boolean>();
    const hits: SearchHit[] = [];
    for (const id of ids) {
      const msg = this.db.messages.get(id);
      if (!msg || msg.deletedAt !== null || msg.workspaceId !== workspaceId) continue;
      if (fromUser && msg.authorId !== fromUser.id) continue;
      const channel = this.db.channels.get(msg.channelId);
      if (!channel) continue;
      if (parsed.inChannel && channel.name !== parsed.inChannel) continue;
      let ok = readable.get(channel.id);
      if (ok === undefined) {
        ok = this.access.canRead(actorId, channel);
        readable.set(channel.id, ok);
      }
      if (!ok) continue;
      hits.push({ message: msg, channelName: channel.name, snippet: "" });
    }
    hits.sort((a, b) => b.message.createdAt - a.message.createdAt || (a.message.id < b.message.id ? 1 : -1));
    const ctx = {
      userName: (id: string) => this.db.users.get(id)?.displayName,
      channelName: (id: string) => this.db.channels.get(id)?.name,
    };
    return hits.slice(0, limit).map((h) => ({ ...h, snippet: renderPreview(h.message.text, ctx, 120) }));
  }
}
