import { command, type CommandDef } from "./router";
import { toPublicChannel, toPublicMessage } from "./serializers";
import { v } from "./validation";

// Every public command. Handlers stay thin: validate (via schema), call a
// service, serialize. Business rules belong in services, not here.

export const chatCommands = [
  command({
    name: "chat.postMessage",
    bucket: "chat.write",
    schema: {
      channelId: v.id("c"),
      text: v.string({ min: 1, max: 4000 }),
      threadId: v.optional(v.id("m")),
    },
    handler: ({ actorId, app }, p) => {
      app.presence.touch(actorId);
      const message = app.messages.post(actorId, p.channelId, p.text, { parentId: p.threadId ?? null });
      return { message: toPublicMessage(message) };
    },
  }),

  command({
    name: "chat.update",
    bucket: "chat.write",
    schema: { messageId: v.id("m"), text: v.string({ min: 1, max: 4000 }) },
    handler: ({ actorId, app }, p) => ({ message: toPublicMessage(app.messages.edit(actorId, p.messageId, p.text)) }),
  }),

  command({
    name: "chat.delete",
    bucket: "chat.write",
    schema: { messageId: v.id("m") },
    handler: ({ actorId, app }, p) => {
      app.messages.delete(actorId, p.messageId);
      return { messageId: p.messageId };
    },
  }),

  command({
    name: "chat.replies",
    schema: { messageId: v.id("m") },
    handler: ({ actorId, app }, p) => {
      const t = app.threads.getThread(actorId, p.messageId);
      return { parent: toPublicMessage(t.parent), replies: t.replies.map(toPublicMessage) };
    },
  }),
];

export const conversationCommands = [
  command({
    name: "conversations.create",
    schema: {
      workspaceId: v.id("w"),
      name: v.string({ min: 1, max: 120 }),
      kind: v.optional(v.oneOf(["public", "private"] as const)),
      topic: v.optional(v.string({ max: 250 })),
    },
    handler: ({ actorId, app }, p) => ({
      channel: toPublicChannel(app.channels.create(actorId, p.workspaceId, { name: p.name, kind: p.kind, topic: p.topic })),
    }),
  }),

  command({
    name: "conversations.open",
    schema: { workspaceId: v.id("w"), users: v.array(v.id("u"), { max: 8 }) },
    handler: ({ actorId, app }, p) => ({ channel: toPublicChannel(app.channels.openDm(actorId, p.workspaceId, p.users)) }),
  }),

  command({
    name: "conversations.join",
    schema: { channelId: v.id("c") },
    handler: ({ actorId, app }, p) => ({ channel: toPublicChannel(app.channels.join(actorId, p.channelId)) }),
  }),

  command({
    name: "conversations.leave",
    schema: { channelId: v.id("c") },
    handler: ({ actorId, app }, p) => {
      app.channels.leave(actorId, p.channelId);
      return {};
    },
  }),

  command({
    name: "conversations.invite",
    schema: { channelId: v.id("c"), userId: v.id("u") },
    handler: ({ actorId, app }, p) => {
      app.channels.invite(actorId, p.channelId, p.userId);
      return {};
    },
  }),

  command({
    name: "conversations.rename",
    schema: { channelId: v.id("c"), name: v.string({ min: 1, max: 120 }) },
    handler: ({ actorId, app }, p) => ({ channel: toPublicChannel(app.channels.rename(actorId, p.channelId, p.name)) }),
  }),

  command({
    name: "conversations.setTopic",
    schema: { channelId: v.id("c"), topic: v.string({ max: 250 }) },
    handler: ({ actorId, app }, p) => ({ channel: toPublicChannel(app.channels.setTopic(actorId, p.channelId, p.topic)) }),
  }),

  command({
    name: "conversations.list",
    schema: { workspaceId: v.id("w") },
    handler: ({ actorId, app }, p) => ({ channels: app.channels.list(actorId, p.workspaceId).map(toPublicChannel) }),
  }),

  command({
    name: "conversations.members",
    schema: { channelId: v.id("c") },
    handler: ({ actorId, app }, p) => ({ members: app.channels.members(actorId, p.channelId) }),
  }),

  command({
    name: "conversations.history",
    schema: { channelId: v.id("c"), limit: v.optional(v.int({ min: 1 })), cursor: v.optional(v.string({ max: 512 })) },
    handler: ({ actorId, app }, p) => {
      const page = app.history.history(actorId, p.channelId, { limit: p.limit, cursor: p.cursor });
      return { messages: page.messages.map(toPublicMessage), nextCursor: page.nextCursor };
    },
  }),
];

const emoji = v.string({ min: 1, max: 34 });

export const reactionCommands = [
  command({
    name: "reactions.add",
    schema: { messageId: v.id("m"), emoji },
    handler: ({ actorId, app }, p) => ({ changed: app.reactions.add(actorId, p.messageId, p.emoji) }),
  }),
  command({
    name: "reactions.remove",
    schema: { messageId: v.id("m"), emoji },
    handler: ({ actorId, app }, p) => ({ changed: app.reactions.remove(actorId, p.messageId, p.emoji) }),
  }),
  command({
    name: "reactions.get",
    schema: { messageId: v.id("m") },
    handler: ({ actorId, app }, p) => ({ reactions: app.reactions.summary(actorId, p.messageId) }),
  }),
];

export const searchCommands = [
  command({
    name: "search.messages",
    bucket: "search",
    schema: { workspaceId: v.id("w"), query: v.string({ min: 1, max: 200 }), limit: v.optional(v.int({ min: 1, max: 50 })) },
    handler: ({ actorId, app }, p) => ({
      matches: app.search.search(actorId, p.workspaceId, p.query, { limit: p.limit }).map((h) => ({
        message: toPublicMessage(h.message),
        channelName: h.channelName,
        snippet: h.snippet,
      })),
    }),
  }),
];

export const presenceCommands = [
  command({
    name: "presence.heartbeat",
    schema: {},
    handler: ({ actorId, app }) => {
      app.presence.touch(actorId);
      return { status: app.presence.status(actorId) };
    },
  }),
  command({
    name: "presence.setAway",
    schema: { away: v.bool() },
    handler: ({ actorId, app }, p) => {
      app.presence.setAway(actorId, p.away);
      return { status: app.presence.status(actorId) };
    },
  }),
  command({
    name: "presence.get",
    schema: { userId: v.id("u") },
    handler: ({ app }, p) => ({ status: app.presence.status(p.userId), lastActiveAt: app.presence.lastActiveAt(p.userId) }),
  }),
  command({
    name: "typing.start",
    schema: { channelId: v.id("c") },
    handler: ({ actorId, app }, p) => {
      app.presence.touch(actorId);
      return { emitted: app.typing.start(actorId, p.channelId) };
    },
  }),
  command({
    name: "typing.list",
    schema: { channelId: v.id("c") },
    handler: ({ actorId, app }, p) => {
      app.access.assertRead(actorId, p.channelId);
      return { users: app.typing.active(p.channelId) };
    },
  }),
];

export const userCommands = [
  command({
    name: "users.info",
    schema: { userId: v.id("u") },
    handler: ({ app }, p) => {
      const u = app.users.get(p.userId);
      return { user: { id: u.id, handle: u.handle, displayName: u.displayName, isBot: u.isBot } };
    },
  }),
  command({
    name: "notifications.list",
    schema: { unreadOnly: v.optional(v.bool()) },
    handler: ({ actorId, app }, p) => ({ notifications: app.notifications.inbox(actorId, { unreadOnly: p.unreadOnly }) }),
  }),
  command({
    name: "notifications.markRead",
    schema: { notificationId: v.id("n") },
    handler: ({ actorId, app }, p) => {
      app.notifications.markRead(actorId, p.notificationId);
      return {};
    },
  }),
];

export const pinCommands = [
  command({
    name: "pins.add",
    schema: { channelId: v.id("c"), messageId: v.id("m") },
    handler: ({ actorId, app }, p) => ({ pin: app.pins.add(actorId, p.channelId, p.messageId) }),
  }),
  command({
    name: "pins.remove",
    schema: { channelId: v.id("c"), messageId: v.id("m") },
    handler: ({ actorId, app }, p) => {
      app.pins.remove(actorId, p.channelId, p.messageId);
      return {};
    },
  }),
  command({
    name: "pins.list",
    schema: { channelId: v.id("c") },
    handler: ({ actorId, app }, p) => ({
      pins: app.pins.list(actorId, p.channelId).map(({ pin, message }) => ({ ...pin, message: toPublicMessage(message) })),
    }),
  }),
];

export const ALL_COMMANDS: CommandDef<any>[] = [
  ...pinCommands,
  ...chatCommands,
  ...conversationCommands,
  ...reactionCommands,
  ...searchCommands,
  ...presenceCommands,
  ...userCommands,
];
