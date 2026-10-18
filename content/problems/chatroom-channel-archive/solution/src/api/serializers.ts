import type { Channel, Message } from "../domain/types";

// Wire shapes. Internal fields (deletedAt, workspace ids on messages) stay
// server-side.

export interface PublicMessage {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  mentions: Message["mentions"];
  createdAt: number;
  editedAt: number | null;
  threadId: string | null;
  replyCount: number;
  lastReplyAt: number | null;
  reactions: { emoji: string; count: number; users: string[] }[];
}

export function toPublicMessage(m: Message): PublicMessage {
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    text: m.text,
    mentions: m.mentions,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    threadId: m.parentId,
    replyCount: m.replyCount,
    lastReplyAt: m.lastReplyAt,
    reactions: Object.entries(m.reactions).map(([emoji, users]) => ({ emoji, count: users.length, users: [...users] })),
  };
}

export interface PublicChannel {
  id: string;
  name: string;
  kind: Channel["kind"];
  topic: string;
  isGeneral: boolean;
  archived: boolean;
  createdAt: number;
}

export function toPublicChannel(c: Channel): PublicChannel {
  return { id: c.id, name: c.name, kind: c.kind, topic: c.topic, isGeneral: c.isGeneral, archived: c.archivedAt != null, createdAt: c.createdAt };
}
