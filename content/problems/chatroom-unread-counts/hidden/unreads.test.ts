import { it, expect } from "testkit";
import { setup } from "../fixtures";

const call = (app: any, actorId: string, command: string, params: Record<string, unknown>) => app.api.handle({ command, actorId, params });
const unreads = (app: any, userId: string, wsId: string) => call(app, userId, "conversations.unreads", { workspaceId: wsId }).channels;

it("counts others' top-level messages after the marker; markers only move forward", () => {
  const { app, clock, ws, carol, dave, general } = setup();
  const own = app.messages.post(dave.id, general.id, "morning");
  clock.advance(10);
  const c1 = app.messages.post(carol.id, general.id, "first");
  clock.advance(10);
  app.messages.post(carol.id, general.id, "second");
  app.messages.post(dave.id, general.id, "thread reply", { parentId: c1.id });
  expect(unreads(app, dave.id, ws.id)).toEqual([{ channelId: general.id, unreadCount: 2, mentionCount: 0 }]);
  expect(unreads(app, carol.id, ws.id)).toEqual([]);
  expect(call(app, dave.id, "conversations.mark", { channelId: general.id, messageId: c1.id })).toEqual({ ok: true, unreadCount: 1, mentionCount: 0 });
  expect(call(app, dave.id, "conversations.mark", { channelId: general.id, messageId: own.id })).toEqual({ ok: true, unreadCount: 1, mentionCount: 0 });
});

it("history from before you joined is not unread, however you joined", () => {
  const { app, ws, carol, dave, gus, random, partners } = setup();
  for (const t of ["a", "b", "c"]) app.messages.post(carol.id, random.id, t);
  app.messages.post(carol.id, partners.id, "welcome");
  app.channels.join(dave.id, random.id);
  const fresh = app.users.create({ handle: "erin" });
  app.workspaces.addMember(app.db.workspaces.get(ws.id)!.ownerId, ws.id, fresh.id);
  app.channels.invite(carol.id, random.id, fresh.id);
  expect(unreads(app, dave.id, ws.id)).toEqual([]);
  expect(unreads(app, fresh.id, ws.id)).toEqual([]);
  app.messages.post(carol.id, random.id, "d");
  expect(unreads(app, dave.id, ws.id)).toEqual([{ channelId: random.id, unreadCount: 1, mentionCount: 0 }]);
  expect(unreads(app, gus.id, ws.id)).toEqual([{ channelId: partners.id, unreadCount: 1, mentionCount: 0 }]);
});

it("mentions: direct, @channel and @everyone count, @here doesn't; deletes decrement", () => {
  const { app, ws, alice, carol, dave, general, random } = setup();
  app.channels.join(dave.id, random.id);
  const direct = app.messages.post(carol.id, general.id, "@dave look");
  app.messages.post(carol.id, general.id, "@channel heads up");
  app.messages.post(alice.id, general.id, "@everyone all hands");
  app.messages.post(carol.id, general.id, "@here anyone");
  app.messages.post(carol.id, general.id, "plain");
  app.messages.post(carol.id, random.id, "@dave over here");
  expect(unreads(app, dave.id, ws.id)).toEqual([
    { channelId: general.id, unreadCount: 5, mentionCount: 3 },
    { channelId: random.id, unreadCount: 1, mentionCount: 1 },
  ]);
  app.messages.delete(carol.id, direct.id);
  expect(unreads(app, dave.id, ws.id)[0]).toEqual({ channelId: general.id, unreadCount: 4, mentionCount: 2 });
});

it("pushes unread.updated only to the affected user", async () => {
  const { app, carol, dave, general } = setup();
  const c = app.connect(carol.id);
  const d = app.connect(dave.id);
  const m = app.messages.post(carol.id, general.id, "@dave ping");
  await app.hub.idle();
  const frames = (conn: any) => conn.received.filter((f: any) => f.type === "unread.updated").map((f: any) => f.payload);
  expect(frames(d)).toEqual([{ channelId: general.id, unreadCount: 1, mentionCount: 1 }]);
  expect(frames(c)).toEqual([]);
  call(app, dave.id, "conversations.mark", { channelId: general.id, messageId: m.id });
  await app.hub.idle();
  expect(frames(d)[1]).toEqual({ channelId: general.id, unreadCount: 0, mentionCount: 0 });
  expect(frames(c)).toEqual([]);
});
