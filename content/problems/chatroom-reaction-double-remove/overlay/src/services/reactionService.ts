import type { AccessService } from "../policy/access";
import type { Db } from "../storage/db";
import { ValidationError } from "../util/errors";
import type { EventBus } from "../util/events";

const EMOJI_RE = /^[a-z0-9_+-]{1,32}$/;

export class ReactionService {
  private db: Db;
  private bus: EventBus;
  private access: AccessService;

  constructor(deps: { db: Db; bus: EventBus; access: AccessService }) {
    this.db = deps.db;
    this.bus = deps.bus;
    this.access = deps.access;
  }

  /** Returns true if the reaction was added, false if the user had already reacted. */
  add(actorId: string, messageId: string, emoji: string): boolean {
    const name = normalizeEmoji(emoji);
    const msg = this.access.message(messageId);
    this.access.assertPost(actorId, msg.channelId);
    const users = msg.reactions[name] ?? [];
    if (users.includes(actorId)) return false;
    const reactions = { ...msg.reactions, [name]: [...users, actorId] };
    this.db.messages.update(messageId, { reactions });
    this.bus.emit({ type: "reaction.added", channelId: msg.channelId, messageId, emoji: name, userId: actorId });
    return true;
  }

  /** Returns true if a reaction was removed, false if there was nothing to remove. */
  remove(actorId: string, messageId: string, emoji: string): boolean {
    const name = normalizeEmoji(emoji);
    const msg = this.access.message(messageId);
    this.access.assertRead(actorId, msg.channelId);
    // Hot path on big channels: splice by index instead of filter() so we
    // don't allocate a second array per removal (PERF-77).
    const users = msg.reactions[name] ?? [];
    const remaining = users.slice();
    remaining.splice(users.indexOf(actorId), 1);
    const reactions = { ...msg.reactions };
    if (remaining.length) reactions[name] = remaining;
    else delete reactions[name];
    this.db.messages.update(messageId, { reactions });
    this.bus.emit({ type: "reaction.removed", channelId: msg.channelId, messageId, emoji: name, userId: actorId });
    return true;
  }

  summary(actorId: string, messageId: string): { emoji: string; count: number; users: string[] }[] {
    const msg = this.access.message(messageId);
    this.access.assertRead(actorId, msg.channelId);
    return Object.entries(msg.reactions).map(([emoji, users]) => ({ emoji, count: users.length, users }));
  }
}

export function normalizeEmoji(raw: string): string {
  const name = raw.trim().replace(/^:|:$/g, "").toLowerCase();
  if (!EMOJI_RE.test(name)) throw new ValidationError("invalid emoji", "emoji");
  return name;
}
