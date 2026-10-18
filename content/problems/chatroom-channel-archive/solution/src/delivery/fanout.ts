import { toPublicMessage } from "../api/serializers";
import type { EventBus } from "../util/events";
import { EPHEMERAL_EVENTS } from "../domain/types";
import type { Db } from "../storage/db";
import type { ConnectionHub } from "./hub";

export interface PublishOptions {
  /** Skip this user's connections (e.g. don't echo typing back to the typist). */
  excludeUserId?: string;
}

// Fan-out: turns "this happened in channel X" into frames on every connection
// of every member of X.

export class Fanout {
  private db: Db;
  private hub: ConnectionHub;

  constructor(db: Db, hub: ConnectionHub) {
    this.db = db;
    this.hub = hub;
  }

  /** Returns the number of connections the frame was queued on. */
  publish(channelId: string, type: string, payload: unknown, opts: PublishOptions = {}): number {
    const members = this.db.channelMemberIds(channelId).filter((u) => u !== opts.excludeUserId);
    return this.publishToUsers(members, type, payload);
  }

  publishToUsers(userIds: Iterable<string>, type: string, payload: unknown): number {
    const ephemeral = EPHEMERAL_EVENTS.has(type);
    let count = 0;
    for (const userId of new Set(userIds)) {
      for (const conn of this.hub.connectionsFor(userId)) {
        if (this.hub.deliver(conn.id, type, payload, ephemeral)) count++;
      }
    }
    return count;
  }
}

// Wires domain events onto client connections. Domain code never talks to the
// delivery layer directly — it emits events, and this bridge decides who
// should hear about them.

export function registerDeliveryBridge(bus: EventBus, db: Db, fanout: Fanout): void {
  bus.on("message.created", (e) => {
    fanout.publish(e.message.channelId, "message.created", { message: toPublicMessage(e.message) });
  });
  bus.on("message.updated", (e) => {
    fanout.publish(e.message.channelId, "message.updated", { message: toPublicMessage(e.message) });
  });
  bus.on("message.deleted", (e) => {
    fanout.publish(e.message.channelId, "message.deleted", { channelId: e.message.channelId, messageId: e.message.id });
  });
  bus.on("reaction.added", (e) => {
    fanout.publish(e.channelId, "reaction.added", { messageId: e.messageId, emoji: e.emoji, userId: e.userId });
  });
  bus.on("reaction.removed", (e) => {
    fanout.publish(e.channelId, "reaction.removed", { messageId: e.messageId, emoji: e.emoji, userId: e.userId });
  });
  bus.on("channel.member_joined", (e) => {
    fanout.publish(e.channelId, "channel.member_joined", { channelId: e.channelId, userId: e.userId });
  });
  bus.on("channel.member_left", (e) => {
    fanout.publish(e.channelId, "channel.member_left", { channelId: e.channelId, userId: e.userId });
    fanout.publishToUsers([e.userId], "channel.member_left", { channelId: e.channelId, userId: e.userId });
  });
  bus.on("channel.renamed", (e) => {
    fanout.publish(e.channel.id, "channel.renamed", { channelId: e.channel.id, name: e.channel.name });
  });
  bus.on("channel.archived", (e) => {
    fanout.publish(e.channel.id, "channel.archived", { channelId: e.channel.id });
  });
  bus.on("channel.unarchived", (e) => {
    fanout.publish(e.channel.id, "channel.unarchived", { channelId: e.channel.id });
  });
  bus.on("typing", (e) => {
    fanout.publish(e.channelId, "typing", { channelId: e.channelId, userId: e.userId }, { excludeUserId: e.userId });
  });
  bus.on("presence.changed", (e) => {
    // Everyone who shares a workspace with the user.
    const workspaces = db.workspaceMembers.filter((m) => m.userId === e.userId).map((m) => m.workspaceId);
    const audience = db.workspaceMembers.filter((m) => workspaces.includes(m.workspaceId)).map((m) => m.userId);
    fanout.publishToUsers(audience, "presence.changed", { userId: e.userId, status: e.status });
  });
}
