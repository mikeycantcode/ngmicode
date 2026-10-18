import type { IncomingWebhook } from "../domain/types";
import type { AccessService } from "../policy/access";
import { canManageWebhooks } from "../policy/permissions";
import { memberKey, type Db } from "../storage/db";
import type { MessageService } from "../services/messageService";
import type { UserService } from "../services/workspaceService";
import type { Clock } from "../util/clock";
import { ForbiddenError, isAppError, NotFoundError, ValidationError } from "../util/errors";
import type { IdGenerator } from "../util/clock";
import type { Logger } from "../util/common";
import { getHeader, SIGNATURE_HEADER, verifyV1 } from "./signing";

export interface WebhookRequest {
  hookId: string;
  headers: Record<string, string | undefined>;
  body: string; // raw body, exactly as received — signatures are over these bytes
}

export interface WebhookResponse {
  status: number;
  body: { ok: boolean; error?: string; messageId?: string };
}

// Incoming webhooks let external systems (CI, alerting) post into a channel
// as a bot user. Each hook has its own bot user and signing secret.

export class IncomingWebhookService {
  private db: Db;
  private ids: IdGenerator;
  private clock: Clock;
  private access: AccessService;
  private users: UserService;
  private messages: MessageService;
  private logger: Logger;

  constructor(deps: {
    db: Db;
    ids: IdGenerator;
    clock: Clock;
    access: AccessService;
    users: UserService;
    messages: MessageService;
    logger: Logger;
  }) {
    this.db = deps.db;
    this.ids = deps.ids;
    this.clock = deps.clock;
    this.access = deps.access;
    this.users = deps.users;
    this.messages = deps.messages;
    this.logger = deps.logger;
  }

  create(actorId: string, channelId: string, opts: { name: string }): IncomingWebhook {
    const channel = this.access.channel(channelId);
    const actor = this.access.actor(channel.workspaceId, actorId);
    if (!canManageWebhooks(actor)) throw new ForbiddenError("only admins can manage webhooks");
    if (channel.kind === "dm") throw new ValidationError("webhooks cannot post to DMs", "channelId");
    const base = opts.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "hook";
    let handle = `${base}-bot`;
    for (let i = 2; this.users.byHandle(handle); i++) handle = `${base}-bot-${i}`;
    const bot = this.users.create({ handle, displayName: opts.name.trim() || "Webhook", isBot: true });
    const now = this.clock.now();
    this.db.workspaceMembers.insert(memberKey(channel.workspaceId, bot.id), {
      workspaceId: channel.workspaceId,
      userId: bot.id,
      role: "member",
      joinedAt: now,
    });
    this.db.channelMembers.insert(memberKey(channelId, bot.id), { channelId, userId: bot.id, joinedAt: now });
    const hook: IncomingWebhook = {
      id: this.ids.next("wh"),
      workspaceId: channel.workspaceId,
      channelId,
      botUserId: bot.id,
      secret: this.ids.token("whsec"),
      createdBy: actorId,
      createdAt: now,
      disabled: false,
    };
    return this.db.incomingWebhooks.insert(hook.id, hook);
  }

  disable(actorId: string, hookId: string): void {
    const hook = this.requireHook(hookId);
    const actor = this.access.actor(hook.workspaceId, actorId);
    if (!canManageWebhooks(actor)) throw new ForbiddenError("only admins can manage webhooks");
    this.db.incomingWebhooks.update(hookId, { disabled: true });
  }

  rotateSecret(actorId: string, hookId: string): string {
    const hook = this.requireHook(hookId);
    const actor = this.access.actor(hook.workspaceId, actorId);
    if (!canManageWebhooks(actor)) throw new ForbiddenError("only admins can manage webhooks");
    const secret = this.ids.token("whsec");
    this.db.incomingWebhooks.update(hookId, { secret });
    return secret;
  }

  /** Entry point for POST /hooks/:hookId. Never throws. */
  receive(req: WebhookRequest): WebhookResponse {
    const hook = this.db.incomingWebhooks.get(req.hookId);
    if (!hook) return { status: 404, body: { ok: false, error: "no_such_hook" } };
    if (hook.disabled) return { status: 410, body: { ok: false, error: "hook_disabled" } };

    if (!verifyV1(hook.secret, req.body, getHeader(req.headers, SIGNATURE_HEADER))) {
      this.logger.log("warn", "webhook signature mismatch", { hookId: hook.id });
      return { status: 401, body: { ok: false, error: "invalid_signature" } };
    }

    let payload: { text?: unknown; thread_id?: unknown };
    try {
      payload = JSON.parse(req.body);
    } catch {
      return { status: 400, body: { ok: false, error: "invalid_payload" } };
    }
    if (!payload || typeof payload.text !== "string" || !payload.text.trim()) {
      return { status: 400, body: { ok: false, error: "invalid_payload" } };
    }
    const parentId = typeof payload.thread_id === "string" ? payload.thread_id : null;

    try {
      const msg = this.messages.post(hook.botUserId, hook.channelId, payload.text, { parentId });
      return { status: 200, body: { ok: true, messageId: msg.id } };
    } catch (e) {
      if (isAppError(e)) {
        const status = e.code === "forbidden" ? 403 : e.code === "not_found" ? 404 : 400;
        return { status, body: { ok: false, error: e.code } };
      }
      this.logger.log("error", "webhook post failed", { hookId: hook.id, error: String(e) });
      return { status: 500, body: { ok: false, error: "internal_error" } };
    }
  }

  private requireHook(hookId: string): IncomingWebhook {
    const hook = this.db.incomingWebhooks.get(hookId);
    if (!hook) throw new NotFoundError("webhook not found");
    return hook;
  }
}
