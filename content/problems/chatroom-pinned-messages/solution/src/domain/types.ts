// Core domain model. Everything here is plain data; behavior lives in services.
// Timestamps are epoch ms from the injected Clock.

export type Role = "owner" | "admin" | "member" | "guest";

export interface User {
  id: string;
  handle: string; // unique, lowercase, used for @mentions
  displayName: string;
  isBot: boolean;
  createdAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  generalChannelId: string;
  createdAt: number;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: number;
}

export type ChannelKind = "public" | "private" | "dm";

export interface Channel {
  id: string;
  workspaceId: string;
  name: string; // normalized; DMs get a synthetic name
  kind: ChannelKind;
  topic: string;
  createdBy: string;
  createdAt: number;
  isGeneral: boolean;
}

export interface ChannelMember {
  channelId: string;
  userId: string;
  joinedAt: number;
}

export type Mention =
  | { kind: "user"; userId: string }
  | { kind: "channel"; channelId: string }
  | { kind: "broadcast"; scope: "here" | "channel" | "everyone" };

export interface Message {
  id: string;
  workspaceId: string;
  channelId: string;
  authorId: string;
  /** Canonical text: user input with &<> escaped and mentions as <@u_..>/<#c_..>/<!here> tokens. */
  text: string;
  mentions: Mention[];
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
  /** Set on thread replies; null for top-level messages. */
  parentId: string | null;
  replyCount: number;
  lastReplyAt: number | null;
  /** emoji -> user ids in the order they reacted */
  reactions: Record<string, string[]>;
}

export interface Pin {
  channelId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: number;
}

export type PresenceStatus = "active" | "away" | "offline";

export interface Notification {
  id: string;
  userId: string;
  messageId: string;
  channelId: string;
  reason: "mention" | "broadcast" | "dm" | "thread_reply";
  preview: string;
  createdAt: number;
  read: boolean;
}

export interface IncomingWebhook {
  id: string;
  workspaceId: string;
  channelId: string;
  botUserId: string;
  secret: string;
  createdBy: string;
  createdAt: number;
  disabled: boolean;
}

export interface OutgoingSubscription {
  id: string;
  workspaceId: string;
  botUserId: string;
  url: string;
  secret: string;
  events: string[]; // DomainEvent types
}

// ---- Domain events ----------------------------------------------------------

export type DomainEvent =
  | { type: "message.created"; message: Message }
  | { type: "message.updated"; message: Message; previousText: string }
  | { type: "message.deleted"; message: Message }
  | { type: "reaction.added"; channelId: string; messageId: string; emoji: string; userId: string }
  | { type: "reaction.removed"; channelId: string; messageId: string; emoji: string; userId: string }
  | { type: "channel.created"; channel: Channel }
  | { type: "channel.renamed"; channel: Channel; previousName: string }
  | { type: "channel.member_joined"; channelId: string; userId: string }
  | { type: "channel.member_left"; channelId: string; userId: string }
  | { type: "typing"; channelId: string; userId: string; at: number }
  | { type: "presence.changed"; userId: string; status: PresenceStatus };

export type DomainEventType = DomainEvent["type"];

/** Events that clients may miss without harm (never persisted, may be dropped). */
export const EPHEMERAL_EVENTS: ReadonlySet<string> = new Set(["typing", "presence.changed"]);

// ---- Roles -------------------------------------------------------------------

const RANK: Record<Role, number> = { guest: 0, member: 1, admin: 2, owner: 3 };

export function roleRank(role: Role): number {
  return RANK[role];
}

export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && x in RANK;
}

/** Can `actor` assign `target` role to someone currently holding `current`? */
export function canAssignRole(actor: Role, current: Role, target: Role): boolean {
  if (target === "owner" || current === "owner") return false; // ownership transfer is a separate flow
  return atLeast(actor, "admin") && RANK[actor] > RANK[current] && RANK[actor] > RANK[target];
}
