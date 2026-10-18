import type { Channel, Message } from "../domain/types";
import { memberKey, type Db } from "../storage/db";
import { ForbiddenError, NotFoundError } from "../util/errors";
import { canPostToChannel, canReadChannel, type Actor } from "./permissions";

// Loads the facts the policy needs and throws on denial. Services call these
// instead of reaching into the policy with half-loaded data.

export class AccessService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  actor(workspaceId: string, userId: string): Actor {
    const m = this.db.workspaceMembers.get(memberKey(workspaceId, userId));
    if (!m) throw new ForbiddenError("not a member of this workspace");
    return { userId, role: m.role };
  }

  channel(channelId: string): Channel {
    const ch = this.db.channels.get(channelId);
    if (!ch) throw new NotFoundError("channel not found");
    return ch;
  }

  message(messageId: string): Message {
    const msg = this.db.messages.get(messageId);
    if (!msg || msg.deletedAt !== null) throw new NotFoundError("message not found");
    return msg;
  }

  /** Non-throwing read check, for filtering lists (search, channel lists). */
  canRead(userId: string, channel: Channel): boolean {
    const m = this.db.workspaceMembers.get(memberKey(channel.workspaceId, userId));
    if (!m) return false;
    return canReadChannel({ userId, role: m.role }, channel, this.db.isChannelMember(channel.id, userId));
  }

  assertRead(userId: string, channelId: string): { channel: Channel; actor: Actor } {
    const channel = this.channel(channelId);
    const actor = this.actor(channel.workspaceId, userId);
    if (!canReadChannel(actor, channel, this.db.isChannelMember(channelId, userId))) {
      // Deliberately indistinguishable from "doesn't exist" for private channels.
      if (channel.kind !== "public") throw new NotFoundError("channel not found");
      throw new ForbiddenError("cannot read this channel");
    }
    return { channel, actor };
  }

  assertPost(userId: string, channelId: string): { channel: Channel; actor: Actor } {
    const { channel, actor } = this.assertRead(userId, channelId);
    if (!canPostToChannel(actor, channel, this.db.isChannelMember(channelId, userId))) {
      throw new ForbiddenError("join the channel before posting");
    }
    return { channel, actor };
  }
}
