import { compareMessagePos, type CursorPosition } from "../domain/cursor";
import type { Message } from "../domain/types";
import type { Fanout } from "../delivery/fanout";
import type { AccessService } from "../policy/access";
import { memberKey, type Db } from "../storage/db";
import { ForbiddenError, NotFoundError } from "../util/errors";
import type { EventBus } from "../util/events";

export interface UnreadCounts {
  unreadCount: number;
  mentionCount: number;
}

// Per-user read markers and unread/mention counts, driven entirely by bus
// events so that every membership path (join, invite, create, DM, workspace
// onboarding) initializes the marker the same way.

export class ReadStateService {
  private db: Db;
  private access: AccessService;
  private fanout: Fanout;
  /** channel:user -> last read position (null = channel was empty when they joined) */
  private markers = new Map<string, CursorPosition | null>();

  constructor(deps: { db: Db; bus: EventBus; access: AccessService; fanout: Fanout }) {
    this.db = deps.db;
    this.access = deps.access;
    this.fanout = deps.fanout;
    deps.bus.on("channel.member_joined", (e) => this.markers.set(memberKey(e.channelId, e.userId), this.latest(e.channelId)));
    deps.bus.on("channel.member_left", (e) => this.markers.delete(memberKey(e.channelId, e.userId)));
    deps.bus.on("message.created", (e) => this.onCreated(e.message));
    deps.bus.on("message.deleted", (e) => this.onDeleted(e.message));
  }

  mark(actorId: string, channelId: string, messageId: string): UnreadCounts {
    this.access.assertRead(actorId, channelId);
    if (!this.db.isChannelMember(channelId, actorId)) throw new ForbiddenError("not a member of this channel");
    const msg = this.db.messages.get(messageId);
    if (!msg || msg.deletedAt !== null || msg.parentId !== null || msg.channelId !== channelId) {
      throw new NotFoundError("message not found");
    }
    const key = memberKey(channelId, actorId);
    const cur = this.markers.get(key) ?? null;
    const pos = { createdAt: msg.createdAt, id: msg.id };
    if (!cur || compareMessagePos(pos, cur) > 0) {
      this.markers.set(key, pos);
      this.push(actorId, channelId);
    }
    return this.counts(actorId, channelId);
  }

  unreads(actorId: string, workspaceId: string): ({ channelId: string } & UnreadCounts)[] {
    this.access.actor(workspaceId, actorId);
    const channels = this.db.channels
      .filter((c) => c.workspaceId === workspaceId && this.db.isChannelMember(c.id, actorId))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const out: ({ channelId: string } & UnreadCounts)[] = [];
    for (const c of channels) {
      const counts = this.counts(actorId, c.id);
      if (counts.unreadCount > 0) out.push({ channelId: c.id, ...counts });
    }
    return out;
  }

  counts(userId: string, channelId: string): UnreadCounts {
    const marker = this.markers.get(memberKey(channelId, userId)) ?? null;
    let unreadCount = 0;
    let mentionCount = 0;
    const positions = this.db.timeline.channel(channelId);
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i];
      if (marker && compareMessagePos(pos, marker) <= 0) break;
      const msg = this.db.messages.get(pos.id);
      if (!msg || msg.deletedAt !== null || msg.authorId === userId) continue;
      unreadCount++;
      if (mentionsUser(msg, userId)) mentionCount++;
    }
    return { unreadCount, mentionCount };
  }

  private onCreated(msg: Message): void {
    if (msg.parentId !== null) return;
    this.markers.set(memberKey(msg.channelId, msg.authorId), { createdAt: msg.createdAt, id: msg.id });
    for (const userId of this.db.channelMemberIds(msg.channelId)) {
      if (userId !== msg.authorId) this.push(userId, msg.channelId);
    }
  }

  private onDeleted(msg: Message): void {
    if (msg.parentId !== null) return;
    const pos = { createdAt: msg.createdAt, id: msg.id };
    for (const userId of this.db.channelMemberIds(msg.channelId)) {
      if (userId === msg.authorId) continue;
      const marker = this.markers.get(memberKey(msg.channelId, userId)) ?? null;
      if (!marker || compareMessagePos(pos, marker) > 0) this.push(userId, msg.channelId);
    }
  }

  private push(userId: string, channelId: string): void {
    this.fanout.publishToUsers([userId], "unread.updated", { channelId, ...this.counts(userId, channelId) });
  }

  private latest(channelId: string): CursorPosition | null {
    const positions = this.db.timeline.channel(channelId);
    const last = positions[positions.length - 1];
    return last ? { createdAt: last.createdAt, id: last.id } : null;
  }
}

function mentionsUser(msg: Message, userId: string): boolean {
  return msg.mentions.some(
    (m) => (m.kind === "user" && m.userId === userId) || (m.kind === "broadcast" && (m.scope === "channel" || m.scope === "everyone")),
  );
}
