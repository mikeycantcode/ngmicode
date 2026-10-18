import { toPublicMessage } from "../api/serializers";
import type { DomainEvent } from "../domain/types";
import type { OutgoingSubscription } from "../domain/types";
import type { ChatConfig } from "../config";
import type { AccessService } from "../policy/access";
import { canManageWebhooks } from "../policy/permissions";
import type { Db } from "../storage/db";
import type { Clock } from "../util/clock";
import { ForbiddenError, ValidationError } from "../util/errors";
import type { EventBus } from "../util/events";
import type { IdGenerator } from "../util/clock";
import { signedHeaders } from "./signing";

export interface HttpTransport {
  post(url: string, req: { headers: Record<string, string>; body: string }): Promise<{ status: number }>;
}

interface Delivery {
  id: string;
  subscriptionId: string;
  body: string;
  attempts: number;
  nextAttemptAt: number;
  lastStatus: number | null;
}

// Outgoing event subscriptions for bot integrations. Events are queued on the
// bus synchronously and delivered by flush(), which the app runs on a timer.
// Failed deliveries retry with exponential backoff, then dead-letter.

export class OutgoingWebhookDispatcher {
  private db: Db;
  private ids: IdGenerator;
  private clock: Clock;
  private access: AccessService;
  private config: ChatConfig;
  private transport: HttpTransport;
  private queue: Delivery[] = [];
  readonly deadLetters: Delivery[] = [];

  constructor(deps: {
    db: Db;
    ids: IdGenerator;
    clock: Clock;
    bus: EventBus;
    access: AccessService;
    config: ChatConfig;
    transport: HttpTransport;
  }) {
    this.db = deps.db;
    this.ids = deps.ids;
    this.clock = deps.clock;
    this.access = deps.access;
    this.config = deps.config;
    this.transport = deps.transport;
    deps.bus.onAny((e) => this.onEvent(e));
  }

  subscribe(actorId: string, workspaceId: string, input: { botUserId: string; url: string; events: string[] }): OutgoingSubscription {
    const actor = this.access.actor(workspaceId, actorId);
    if (!canManageWebhooks(actor)) throw new ForbiddenError("only admins can manage webhooks");
    if (!/^https:\/\//.test(input.url)) throw new ValidationError("url must be https", "url");
    if (!input.events.length) throw new ValidationError("subscribe to at least one event", "events");
    this.access.actor(workspaceId, input.botUserId);
    const sub: OutgoingSubscription = {
      id: this.ids.next("sub"),
      workspaceId,
      botUserId: input.botUserId,
      url: input.url,
      secret: this.ids.token("ossec"),
      events: [...input.events],
    };
    return this.db.outgoingSubscriptions.insert(sub.id, sub);
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Delivers everything that's due. Returns the number of successful deliveries. */
  async flush(): Promise<number> {
    const now = this.clock.now();
    const due = this.queue.filter((d) => d.nextAttemptAt <= now);
    this.queue = this.queue.filter((d) => d.nextAttemptAt > now);
    let delivered = 0;
    for (const d of due) {
      const sub = this.db.outgoingSubscriptions.get(d.subscriptionId);
      if (!sub) continue;
      let status = 0;
      try {
        const res = await this.transport.post(sub.url, {
          // Re-signed per attempt: retries carry a fresh timestamp.
          headers: { "content-type": "application/json", ...signedHeaders(sub.secret, d.body, this.clock.now()) },
          body: d.body,
        });
        status = res.status;
      } catch {
        status = 0;
      }
      d.attempts += 1;
      d.lastStatus = status;
      if (status >= 200 && status < 300) {
        delivered++;
      } else if (d.attempts >= this.config.webhooks.maxAttempts) {
        this.deadLetters.push(d);
      } else {
        d.nextAttemptAt = this.clock.now() + this.config.webhooks.retryBaseMs * 2 ** (d.attempts - 1);
        this.queue.push(d);
      }
    }
    return delivered;
  }

  private onEvent(e: DomainEvent): void {
    const ctx = this.eventContext(e);
    if (!ctx) return;
    for (const sub of this.db.outgoingSubscriptions.filter((s) => s.workspaceId === ctx.workspaceId)) {
      if (!sub.events.includes(e.type)) continue;
      if (ctx.actorId === sub.botUserId) continue; // never echo a bot's own actions back to it
      if (ctx.channelId && !this.db.isChannelMember(ctx.channelId, sub.botUserId)) continue;
      const body = JSON.stringify({ type: e.type, workspaceId: ctx.workspaceId, event: ctx.payload, sentAt: this.clock.now() });
      this.queue.push({
        id: this.ids.next("dlv"),
        subscriptionId: sub.id,
        body,
        attempts: 0,
        nextAttemptAt: this.clock.now(),
        lastStatus: null,
      });
    }
  }

  private eventContext(e: DomainEvent): { workspaceId: string; channelId?: string; actorId?: string; payload: unknown } | null {
    switch (e.type) {
      case "message.created":
      case "message.updated":
        return { workspaceId: e.message.workspaceId, channelId: e.message.channelId, actorId: e.message.authorId, payload: toPublicMessage(e.message) };
      case "message.deleted":
        return { workspaceId: e.message.workspaceId, channelId: e.message.channelId, payload: { messageId: e.message.id } };
      case "reaction.added":
      case "reaction.removed": {
        const ch = this.db.channels.get(e.channelId);
        return ch ? { workspaceId: ch.workspaceId, channelId: ch.id, actorId: e.userId, payload: { messageId: e.messageId, emoji: e.emoji, userId: e.userId } } : null;
      }
      case "channel.created":
        return e.channel.kind === "public" ? { workspaceId: e.channel.workspaceId, payload: { channelId: e.channel.id, name: e.channel.name } } : null;
      default:
        return null;
    }
  }
}
