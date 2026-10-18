import { renderPreview, type PreviewContext } from "../domain/preview";
import type { Message, Notification } from "../domain/types";
import type { ChatConfig } from "../config";
import type { AccessService } from "../policy/access";
import type { Db } from "../storage/db";
import type { Clock } from "../util/clock";
import { NotFoundError } from "../util/errors";
import type { EventBus } from "../util/events";
import type { IdGenerator } from "../util/clock";
import type { PresenceService } from "./presenceService";
import type { ThreadService } from "./threadService";

const PRECEDENCE: Notification["reason"][] = ["mention", "dm", "broadcast", "thread_reply"];

export class NotificationService {
  private db: Db;
  private ids: IdGenerator;
  private clock: Clock;
  private config: ChatConfig;
  private access: AccessService;
  private presence: PresenceService;
  private threads: ThreadService;

  constructor(deps: {
    db: Db;
    ids: IdGenerator;
    clock: Clock;
    bus: EventBus;
    config: ChatConfig;
    access: AccessService;
    presence: PresenceService;
    threads: ThreadService;
  }) {
    this.db = deps.db;
    this.ids = deps.ids;
    this.clock = deps.clock;
    this.config = deps.config;
    this.access = deps.access;
    this.presence = deps.presence;
    this.threads = deps.threads;
    deps.bus.on("message.created", (e) => this.onMessage(e.message));
  }

  inbox(userId: string, opts: { unreadOnly?: boolean } = {}): Notification[] {
    return this.db.notifications
      .filter((n) => n.userId === userId && (!opts.unreadOnly || !n.read))
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
  }

  markRead(userId: string, notificationId: string): void {
    const n = this.db.notifications.get(notificationId);
    if (!n || n.userId !== userId) throw new NotFoundError("notification not found");
    this.db.notifications.update(notificationId, { read: true });
  }

  previewContext(): PreviewContext {
    return {
      userName: (id) => this.db.users.get(id)?.displayName,
      channelName: (id) => this.db.channels.get(id)?.name,
    };
  }

  private onMessage(msg: Message): void {
    const channel = this.db.channels.get(msg.channelId);
    if (!channel) return;
    const reasons = new Map<string, Notification["reason"]>();
    const offer = (userId: string, reason: Notification["reason"]) => {
      if (userId === msg.authorId) return;
      const cur = reasons.get(userId);
      if (!cur || PRECEDENCE.indexOf(reason) < PRECEDENCE.indexOf(cur)) reasons.set(userId, reason);
    };

    const members = this.db.channelMemberIds(msg.channelId);
    if (channel.kind === "dm") for (const u of members) offer(u, "dm");

    for (const m of msg.mentions) {
      if (m.kind === "user") {
        // Only notify people who could actually open the message.
        if (this.access.canRead(m.userId, channel)) offer(m.userId, "mention");
      } else if (m.kind === "broadcast") {
        for (const u of members) {
          if (m.scope === "here" && this.presence.status(u) !== "active") continue;
          offer(u, "broadcast");
        }
      }
    }

    if (msg.parentId) {
      const parent = this.db.messages.get(msg.parentId);
      if (parent) offer(parent.authorId, "thread_reply");
      for (const u of this.threads.participants(msg.parentId)) offer(u, "thread_reply");
    }

    const preview = renderPreview(msg.text, this.previewContext(), this.config.notifications.previewLength);
    for (const [userId, reason] of reasons) {
      const n: Notification = {
        id: this.ids.next("n"),
        userId,
        messageId: msg.id,
        channelId: msg.channelId,
        reason,
        preview,
        createdAt: this.clock.now(),
        read: false,
      };
      this.db.notifications.insert(n.id, n);
    }
  }
}
