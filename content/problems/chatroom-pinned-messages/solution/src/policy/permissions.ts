import { atLeast } from "../domain/types";
import type { Channel, Message, Role } from "../domain/types";

// The permission policy. Pure functions only — callers load the facts
// (role, membership) and ask. Keep every authorization rule in this file so
// security review has a single place to look.
//
// Summary:
//   - guests only ever see channels they've been explicitly added to
//   - public channels are readable by any non-guest workspace member
//   - private channels and DMs are readable by their members only
//   - posting requires channel membership (join public channels first)

export interface Actor {
  userId: string;
  role: Role;
}

export function canReadChannel(actor: Actor, channel: Channel, isMember: boolean): boolean {
  if (isMember) return true;
  if (channel.kind !== "public") return false;
  return actor.role !== "guest";
}

export function canPostToChannel(_actor: Actor, _channel: Channel, isMember: boolean): boolean {
  return isMember;
}

export function canJoinChannel(actor: Actor, channel: Channel): boolean {
  return channel.kind === "public" && actor.role !== "guest";
}

export function canCreateChannel(actor: Actor): boolean {
  return actor.role !== "guest";
}

export function canManageChannel(actor: Actor, channel: Channel): boolean {
  if (channel.kind === "dm") return false;
  return atLeast(actor.role, "admin") || channel.createdBy === actor.userId;
}

export function canInviteToChannel(actor: Actor, channel: Channel, isMember: boolean): boolean {
  if (channel.kind === "dm") return false;
  return isMember && actor.role !== "guest";
}

export function canEditMessage(actor: Actor, message: Message): boolean {
  return message.authorId === actor.userId;
}

export function canDeleteMessage(actor: Actor, message: Message): boolean {
  return message.authorId === actor.userId || atLeast(actor.role, "admin");
}

export function canUseBroadcast(actor: Actor, scope: "here" | "channel" | "everyone"): boolean {
  if (actor.role === "guest") return false;
  if (scope === "everyone") return atLeast(actor.role, "admin");
  return true;
}

export function canPin(actor: Actor, channel: Channel, isMember: boolean): boolean {
  return isMember && actor.role !== "guest";
}

export function canManageWebhooks(actor: Actor): boolean {
  return atLeast(actor.role, "admin");
}

export function canInviteToWorkspace(actor: Actor): boolean {
  return atLeast(actor.role, "admin");
}
