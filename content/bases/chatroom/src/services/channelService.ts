import { normalizeChannelName } from "../domain/channelName";
import type { Channel, ChannelKind } from "../domain/types";
import type { AccessService } from "../policy/access";
import { canCreateChannel, canInviteToChannel, canJoinChannel, canManageChannel } from "../policy/permissions";
import { memberKey, type Db } from "../storage/db";
import type { Clock } from "../util/clock";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../util/errors";
import type { EventBus } from "../util/events";
import type { IdGenerator } from "../util/clock";

export interface CreateChannelInput {
  name: string;
  kind?: Exclude<ChannelKind, "dm">;
  topic?: string;
}

export class ChannelService {
  private db: Db;
  private ids: IdGenerator;
  private clock: Clock;
  private bus: EventBus;
  private access: AccessService;

  constructor(deps: { db: Db; ids: IdGenerator; clock: Clock; bus: EventBus; access: AccessService }) {
    this.db = deps.db;
    this.ids = deps.ids;
    this.clock = deps.clock;
    this.bus = deps.bus;
    this.access = deps.access;
  }

  create(actorId: string, workspaceId: string, input: CreateChannelInput): Channel {
    const actor = this.access.actor(workspaceId, actorId);
    if (!canCreateChannel(actor)) throw new ForbiddenError("guests cannot create channels");
    const name = normalizeChannelName(input.name);
    this.assertNameFree(workspaceId, name);
    const channel: Channel = {
      id: this.ids.next("c"),
      workspaceId,
      name,
      kind: input.kind ?? "public",
      topic: (input.topic ?? "").trim(),
      createdBy: actorId,
      createdAt: this.clock.now(),
      isGeneral: false,
    };
    this.db.channels.insert(channel.id, channel);
    this.bus.emit({ type: "channel.created", channel });
    this.addMember(channel.id, actorId);
    return channel;
  }

  /** Opens (or reuses) the DM between the actor and `otherUserIds`. */
  openDm(actorId: string, workspaceId: string, otherUserIds: string[]): Channel {
    this.access.actor(workspaceId, actorId);
    const memberIds = [...new Set([actorId, ...otherUserIds])].sort();
    if (memberIds.length < 2 || memberIds.length > 9) throw new ValidationError("a DM needs 2-9 participants", "users");
    for (const id of memberIds) this.access.actor(workspaceId, id);
    const name = `dm-${memberIds.join("-")}`;
    const existing = this.db.channels.find((c) => c.workspaceId === workspaceId && c.kind === "dm" && c.name === name);
    if (existing) return existing;
    const channel: Channel = {
      id: this.ids.next("c"),
      workspaceId,
      name,
      kind: "dm",
      topic: "",
      createdBy: actorId,
      createdAt: this.clock.now(),
      isGeneral: false,
    };
    this.db.channels.insert(channel.id, channel);
    this.bus.emit({ type: "channel.created", channel });
    for (const id of memberIds) this.addMember(channel.id, id);
    return channel;
  }

  join(actorId: string, channelId: string): Channel {
    const channel = this.access.channel(channelId);
    const actor = this.access.actor(channel.workspaceId, actorId);
    if (this.db.isChannelMember(channelId, actorId)) return channel;
    if (!canJoinChannel(actor, channel)) {
      if (channel.kind !== "public") throw new NotFoundError("channel not found");
      throw new ForbiddenError("cannot join this channel");
    }
    this.addMember(channelId, actorId);
    return channel;
  }

  leave(actorId: string, channelId: string): void {
    const channel = this.access.channel(channelId);
    if (channel.isGeneral) throw new ValidationError("cannot leave #general");
    if (channel.kind === "dm") throw new ValidationError("cannot leave a DM");
    const key = memberKey(channelId, actorId);
    if (!this.db.channelMembers.delete(key)) return;
    this.bus.emit({ type: "channel.member_left", channelId, userId: actorId });
  }

  invite(actorId: string, channelId: string, userId: string): void {
    const channel = this.access.channel(channelId);
    const actor = this.access.actor(channel.workspaceId, actorId);
    if (!canInviteToChannel(actor, channel, this.db.isChannelMember(channelId, actorId))) {
      throw new ForbiddenError("cannot invite to this channel");
    }
    this.access.actor(channel.workspaceId, userId); // target must be in the workspace
    this.addMember(channelId, userId);
  }

  rename(actorId: string, channelId: string, newName: string): Channel {
    const channel = this.access.channel(channelId);
    const actor = this.access.actor(channel.workspaceId, actorId);
    if (!canManageChannel(actor, channel)) throw new ForbiddenError("cannot rename this channel");
    const name = normalizeChannelName(newName);
    if (name === channel.name) return channel;
    this.assertNameFree(channel.workspaceId, name);
    const updated = this.db.channels.update(channelId, { name });
    this.bus.emit({ type: "channel.renamed", channel: updated, previousName: channel.name });
    return updated;
  }

  setTopic(actorId: string, channelId: string, topic: string): Channel {
    this.access.assertPost(actorId, channelId);
    if (topic.length > 250) throw new ValidationError("topic too long", "topic");
    return this.db.channels.update(channelId, { topic: topic.trim() });
  }

  /** Channels visible to the actor, sorted by name. DMs are included only for participants. */
  list(actorId: string, workspaceId: string): Channel[] {
    this.access.actor(workspaceId, actorId);
    return this.db.channels
      .filter((c) => c.workspaceId === workspaceId)
      .filter((c) => this.access.canRead(actorId, c))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  members(actorId: string, channelId: string): string[] {
    this.access.assertRead(actorId, channelId);
    return this.db.channelMemberIds(channelId);
  }

  byName(workspaceId: string, name: string): Channel | undefined {
    return this.db.channels.find((c) => c.workspaceId === workspaceId && c.kind !== "dm" && c.name === name);
  }

  private assertNameFree(workspaceId: string, name: string): void {
    if (this.byName(workspaceId, name)) throw new ConflictError("channel name already taken");
  }

  private addMember(channelId: string, userId: string): void {
    const key = memberKey(channelId, userId);
    if (this.db.channelMembers.has(key)) return;
    this.db.channelMembers.insert(key, { channelId, userId, joinedAt: this.clock.now() });
    this.bus.emit({ type: "channel.member_joined", channelId, userId });
  }
}
