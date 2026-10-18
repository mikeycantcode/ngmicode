import { compareMessagePos, type CursorPosition } from "../domain/cursor";
import type {
  Channel,
  ChannelMember,
  IncomingWebhook,
  Message,
  Notification,
  OutgoingSubscription,
  User,
  Workspace,
  WorkspaceMember,
} from "../domain/types";
import { Table } from "./table";

export function memberKey(scopeId: string, userId: string): string {
  return `${scopeId}:${userId}`;
}

export class Db {
  readonly users = new Table<User>("users");
  readonly workspaces = new Table<Workspace>("workspaces");
  readonly workspaceMembers = new Table<WorkspaceMember>("workspace_members"); // key: ws:user
  readonly channels = new Table<Channel>("channels");
  readonly channelMembers = new Table<ChannelMember>("channel_members"); // key: channel:user
  readonly messages = new Table<Message>("messages");
  readonly notifications = new Table<Notification>("notifications");
  readonly incomingWebhooks = new Table<IncomingWebhook>("incoming_webhooks");
  readonly outgoingSubscriptions = new Table<OutgoingSubscription>("outgoing_subscriptions");
  /** Ordered message ids per channel (top-level) and per thread parent (replies). */
  readonly timeline = new MessageTimeline();

  channelMemberIds(channelId: string): string[] {
    return this.channelMembers.filter((m) => m.channelId === channelId).map((m) => m.userId);
  }

  isChannelMember(channelId: string, userId: string): boolean {
    return this.channelMembers.has(memberKey(channelId, userId));
  }

  workspaceRole(workspaceId: string, userId: string): WorkspaceMember["role"] | undefined {
    return this.workspaceMembers.get(memberKey(workspaceId, userId))?.role;
  }
}

// Keeps message positions sorted per channel / per thread so history and
// thread reads don't have to scan the whole messages table.
//
// Entries are appended in (createdAt, id) order in practice because the clock
// is monotonic, but insert() keeps the list sorted regardless (imports and
// webhook backfills can arrive out of order).

export class MessageTimeline {
  private channels = new Map<string, CursorPosition[]>();
  private threads = new Map<string, CursorPosition[]>();

  addTopLevel(channelId: string, pos: CursorPosition): void {
    insertSorted(this.list(this.channels, channelId), pos);
  }

  addReply(parentId: string, pos: CursorPosition): void {
    insertSorted(this.list(this.threads, parentId), pos);
  }

  /** Oldest-first positions for a channel's top-level messages. */
  channel(channelId: string): readonly CursorPosition[] {
    return this.channels.get(channelId) ?? [];
  }

  /** Oldest-first positions for a thread's replies. */
  thread(parentId: string): readonly CursorPosition[] {
    return this.threads.get(parentId) ?? [];
  }

  private list(map: Map<string, CursorPosition[]>, key: string): CursorPosition[] {
    let l = map.get(key);
    if (!l) {
      l = [];
      map.set(key, l);
    }
    return l;
  }
}

function insertSorted(list: CursorPosition[], pos: CursorPosition): void {
  let i = list.length;
  while (i > 0 && compareMessagePos(list[i - 1], pos) > 0) i--;
  list.splice(i, 0, { createdAt: pos.createdAt, id: pos.id });
}
