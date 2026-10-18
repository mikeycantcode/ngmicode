import type { Message, Pin } from "../domain/types";
import type { AccessService } from "../policy/access";
import { canPin } from "../policy/permissions";
import { memberKey, type Db } from "../storage/db";
import type { Clock } from "../util/clock";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../util/errors";
import type { EventBus } from "../util/events";

export const MAX_PINS_PER_CHANNEL = 100;

export class PinService {
  private db: Db;
  private clock: Clock;
  private access: AccessService;

  constructor(deps: { db: Db; clock: Clock; bus: EventBus; access: AccessService }) {
    this.db = deps.db;
    this.clock = deps.clock;
    this.access = deps.access;
    deps.bus.on("message.deleted", (e) => this.db.pins.delete(memberKey(e.message.channelId, e.message.id)));
  }

  add(actorId: string, channelId: string, messageId: string): Pin {
    this.assertCanPin(actorId, channelId);
    const msg = this.messageIn(channelId, messageId);
    if (msg.parentId !== null) throw new ValidationError("thread replies cannot be pinned", "messageId");
    const key = memberKey(channelId, messageId);
    const existing = this.db.pins.get(key);
    if (existing) return existing;
    if (this.db.pins.filter((p) => p.channelId === channelId).length >= MAX_PINS_PER_CHANNEL) {
      throw new AppError("too_many_pins", `a channel can have at most ${MAX_PINS_PER_CHANNEL} pins`);
    }
    return this.db.pins.insert(key, { channelId, messageId, pinnedBy: actorId, pinnedAt: this.clock.now() });
  }

  remove(actorId: string, channelId: string, messageId: string): void {
    this.assertCanPin(actorId, channelId);
    if (!this.db.pins.delete(memberKey(channelId, messageId))) throw new NotFoundError("pin not found");
  }

  /** Most recently pinned first. */
  list(actorId: string, channelId: string): { pin: Pin; message: Message }[] {
    this.access.assertRead(actorId, channelId);
    const pins = this.db.pins.filter((p) => p.channelId === channelId).reverse();
    pins.sort((a, b) => b.pinnedAt - a.pinnedAt); // stable: later inserts win ties
    const out: { pin: Pin; message: Message }[] = [];
    for (const pin of pins) {
      const message = this.db.messages.get(pin.messageId);
      if (message && message.deletedAt === null) out.push({ pin, message });
    }
    return out;
  }

  private assertCanPin(actorId: string, channelId: string): void {
    const { channel, actor } = this.access.assertPost(actorId, channelId);
    if (!canPin(actor, channel, true)) throw new ForbiddenError("guests cannot pin messages");
  }

  private messageIn(channelId: string, messageId: string): Message {
    const msg = this.db.messages.get(messageId);
    if (!msg || msg.deletedAt !== null || msg.channelId !== channelId) throw new NotFoundError("message not found");
    return msg;
  }
}
