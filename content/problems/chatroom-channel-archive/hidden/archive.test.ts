import { it, expect } from "testkit";
import { signV1 } from "../../src/integrations/signing";
import { setup } from "../fixtures";

const call = (app: any, actorId: string, command: string, params: Record<string, unknown>) => app.api.handle({ command, actorId, params });

it("archived channels reject every kind of write but stay readable", () => {
  const { app, ws, bob, carol, dave, random } = setup();
  call(app, dave.id, "conversations.join", { channelId: random.id });
  const m = app.messages.post(carol.id, random.id, "retro notes");
  app.reactions.add(dave.id, m.id, "eyes");
  const r = call(app, carol.id, "conversations.archive", { channelId: random.id });
  expect(r).toMatchObject({ ok: true, channel: { id: random.id, archived: true } });

  const writes: [string, string, Record<string, unknown>][] = [
    [carol.id, "chat.postMessage", { channelId: random.id, text: "hello?" }],
    [carol.id, "chat.postMessage", { channelId: random.id, text: "reply", threadId: m.id }],
    [carol.id, "chat.update", { messageId: m.id, text: "edited" }],
    [carol.id, "reactions.add", { messageId: m.id, emoji: "tada" }],
    [dave.id, "reactions.remove", { messageId: m.id, emoji: "eyes" }],
    [carol.id, "typing.start", { channelId: random.id }],
    [bob.id, "conversations.join", { channelId: random.id }],
  ];
  for (const [actor, command, params] of writes) {
    expect([command, call(app, actor, command, params).error]).toEqual([command, "channel_archived"]);
  }
  expect(app.db.messages.get(m.id)!.text).toBe("retro notes");
  expect(call(app, dave.id, "conversations.history", { channelId: random.id }).messages).toHaveLength(1);
  expect(app.search.search(dave.id, ws.id, "retro")).toHaveLength(1);
  expect(call(app, bob.id, "chat.delete", { messageId: m.id }).ok).toBe(true);
});

it("incoming webhooks cannot post into an archived channel", () => {
  const { app, bob, random } = setup();
  const hook = app.incomingWebhooks.create(bob.id, random.id, { name: "CI" });
  app.channels.archive(bob.id, random.id);
  const body = JSON.stringify({ text: "build passed" });
  const res = app.incomingWebhooks.receive({ hookId: hook.id, headers: { "x-steer-signature": signV1(hook.secret, body) }, body });
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  expect(res.body.error).toBe("channel_archived");
});

it("permissions, list filtering and unarchive", () => {
  const { app, ws, bob, carol, dave, general, random } = setup();
  call(app, dave.id, "conversations.join", { channelId: random.id });
  expect(call(app, dave.id, "conversations.archive", { channelId: random.id })).toMatchObject({ ok: false, error: "forbidden" });
  expect(call(app, bob.id, "conversations.archive", { channelId: general.id })).toMatchObject({ ok: false, error: "invalid_arguments" });
  const dm = app.channels.openDm(carol.id, ws.id, [dave.id]);
  expect(call(app, carol.id, "conversations.archive", { channelId: dm.id })).toMatchObject({ ok: false, error: "invalid_arguments" });
  expect(call(app, bob.id, "conversations.archive", { channelId: random.id }).ok).toBe(true);
  expect(call(app, bob.id, "conversations.archive", { channelId: random.id }).ok).toBe(true);
  const names = (r: any) => r.channels.map((c: any) => c.name);
  expect(names(call(app, carol.id, "conversations.list", { workspaceId: ws.id }))).not.toContain("random");
  expect(names(call(app, carol.id, "conversations.list", { workspaceId: ws.id, includeArchived: true }))).toContain("random");
  expect(call(app, carol.id, "conversations.unarchive", { channelId: random.id })).toMatchObject({ ok: true, channel: { archived: false } });
  expect(call(app, carol.id, "chat.postMessage", { channelId: random.id, text: "back" }).ok).toBe(true);
});

it("pushes channel.archived to connected members", async () => {
  const { app, carol, dave, random } = setup();
  const c = app.connect(carol.id);
  const d = app.connect(dave.id);
  app.channels.archive(carol.id, random.id);
  await app.hub.idle();
  const frame = c.received.find((f) => f.type === "channel.archived");
  expect(frame?.payload).toEqual({ channelId: random.id });
  expect(d.types()).not.toContain("channel.archived");
});
