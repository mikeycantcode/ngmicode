import { hasBroadcast, parseMentions, type MentionDirectory } from "../domain/mentions";
import type { Message } from "../domain/types";
import type { AccessService } from "../policy/access";
import { canDeleteMessage, canEditMessage, canUseBroadcast, type Actor } from "../policy/permissions";
import { memberKey, type Db } from "../storage/db";
import type { ChatConfig } from "../config";
import type { Clock } from "../util/clock";
import { ForbiddenError, ValidationError } from "../util/errors";
import type { EventBus } from "../util/events";
import type { IdGenerator } from "../util/clock";

export interface PostOptions {
  parentId?: string | null;
}

export class MessageService {
  private db: Db;
  private ids: IdGenerator;
  private clock: Clock;
  private bus: EventBus;
  private access: AccessService;
  private config: ChatConfig;

  constructor(deps: { db: Db; ids: IdGenerator; clock: Clock; bus: EventBus; access: AccessService; config: ChatConfig }) {
    this.db = deps.db;
    this.ids = deps.ids;
    this.clock = deps.clock;
    this.bus = deps.bus;
    this.access = deps.access;
    this.config = deps.config;
  }

  post(actorId: string, channelId: string, rawText: string, opts: PostOptions = {}): Message {
    const { channel, actor } = this.access.assertPost(actorId, channelId);
    this.validateText(rawText);
    const parsed = parseMentions(rawText, this.directory(channel.workspaceId));
    this.assertBroadcastAllowed(actor, parsed.mentions);

    let parent: Message | null = null;
    if (opts.parentId) {
      parent = this.access.message(opts.parentId);
      if (parent.channelId !== channelId) throw new ValidationError("parent message is in a different channel", "parentId");
      if (parent.parentId !== null) throw new ValidationError("cannot reply to a thread reply", "parentId");
    }

    const now = this.clock.now();
    const message: Message = {
      id: this.ids.next("m"),
      workspaceId: channel.workspaceId,
      channelId,
      authorId: actorId,
      text: parsed.text,
      mentions: parsed.mentions,
      createdAt: now,
      editedAt: null,
      deletedAt: null,
      parentId: parent ? parent.id : null,
      replyCount: 0,
      lastReplyAt: null,
      reactions: {},
    };
    this.db.messages.insert(message.id, message);
    if (parent) {
      this.db.timeline.addReply(parent.id, { createdAt: now, id: message.id });
      this.db.messages.update(parent.id, { replyCount: parent.replyCount + 1, lastReplyAt: now });
    } else {
      this.db.timeline.addTopLevel(channelId, { createdAt: now, id: message.id });
    }
    this.bus.emit({ type: "message.created", message });
    return message;
  }

  edit(actorId: string, messageId: string, rawText: string): Message {
    const existing = this.access.message(messageId);
    const actor = this.access.actor(existing.workspaceId, actorId);
    if (!canEditMessage(actor, existing)) throw new ForbiddenError("only the author can edit a message");
    this.validateText(rawText);
    const parsed = parseMentions(rawText, this.directory(existing.workspaceId));
    this.assertBroadcastAllowed(actor, parsed.mentions);
    const updated = this.db.messages.update(messageId, {
      text: parsed.text,
      mentions: parsed.mentions,
      editedAt: this.clock.now(),
    });
    this.bus.emit({ type: "message.updated", message: updated, previousText: existing.text });
    return updated;
  }

  delete(actorId: string, messageId: string): void {
    const existing = this.access.message(messageId);
    const actor = this.access.actor(existing.workspaceId, actorId);
    if (!canDeleteMessage(actor, existing)) throw new ForbiddenError("cannot delete this message");
    const deleted = this.db.messages.update(messageId, { deletedAt: this.clock.now(), text: "", mentions: [], reactions: {} });
    if (existing.parentId) {
      const parent = this.db.messages.get(existing.parentId);
      if (parent) this.db.messages.update(parent.id, { replyCount: Math.max(0, parent.replyCount - 1) });
    }
    this.bus.emit({ type: "message.deleted", message: deleted });
  }

  get(actorId: string, messageId: string): Message {
    const msg = this.access.message(messageId);
    this.access.assertRead(actorId, msg.channelId);
    return msg;
  }

  /** Resolves @handles to workspace members and #names to public channels of the workspace. */
  directory(workspaceId: string): MentionDirectory {
    return {
      userByHandle: (handle) => {
        const user = this.db.users.find((u) => u.handle === handle);
        if (!user || !this.db.workspaceMembers.has(memberKey(workspaceId, user.id))) return undefined;
        return user;
      },
      channelByName: (name) =>
        this.db.channels.find((c) => c.workspaceId === workspaceId && c.kind !== "dm" && c.name === name),
    };
  }

  private validateText(raw: string): void {
    if (typeof raw !== "string" || !raw.trim()) throw new ValidationError("text is required", "text");
    if (raw.length > this.config.messages.maxLength) throw new ValidationError("text too long", "text");
  }

  private assertBroadcastAllowed(actor: Actor, mentions: Message["mentions"]): void {
    if (!hasBroadcast(mentions)) return;
    for (const m of mentions) {
      if (m.kind === "broadcast" && !canUseBroadcast(actor, m.scope)) {
        throw new ForbiddenError(`not allowed to use @${m.scope}`);
      }
    }
  }
}
