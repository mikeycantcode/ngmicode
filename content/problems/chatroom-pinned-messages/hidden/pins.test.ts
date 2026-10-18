import { it, expect } from "testkit";
import { setup } from "../fixtures";

const call = (app: any, actorId: string, command: string, params: Record<string, unknown>) => app.api.handle({ command, actorId, params });

it("pins, lists newest first, is idempotent, and unpins", () => {
  const { app, clock, carol, dave, general } = setup();
  const m1 = app.messages.post(carol.id, general.id, "on-call: dave");
  const m2 = app.messages.post(carol.id, general.id, "release checklist");
  const first = call(app, carol.id, "pins.add", { channelId: general.id, messageId: m1.id });
  expect(first).toMatchObject({ ok: true, pin: { channelId: general.id, messageId: m1.id, pinnedBy: carol.id } });
  clock.advance(5000);
  call(app, dave.id, "pins.add", { channelId: general.id, messageId: m2.id });
  clock.advance(5000);
  const again = call(app, dave.id, "pins.add", { channelId: general.id, messageId: m1.id });
  expect(again.pin).toEqual(first.pin);
  const list = call(app, dave.id, "pins.list", { channelId: general.id });
  expect(list.pins.map((p: any) => p.messageId)).toEqual([m2.id, m1.id]);
  expect(list.pins[0].message.text).toBe("release checklist");
  expect(list.pins[0].pinnedBy).toBe(dave.id);
  expect(call(app, carol.id, "pins.remove", { channelId: general.id, messageId: m2.id }).ok).toBe(true);
  expect(call(app, carol.id, "pins.remove", { channelId: general.id, messageId: m2.id })).toMatchObject({ ok: false, error: "not_found" });
  expect(call(app, carol.id, "pins.list", { channelId: general.id }).pins).toHaveLength(1);
});

it("cannot pin a message from another channel into this one", () => {
  const { app, bob, carol, general, exec, random } = setup();
  const secret = app.messages.post(bob.id, exec.id, "layoff list");
  expect(call(app, carol.id, "pins.add", { channelId: general.id, messageId: secret.id })).toMatchObject({ ok: false, error: "not_found" });
  const r = app.messages.post(carol.id, random.id, "random thing");
  expect(call(app, carol.id, "pins.add", { channelId: general.id, messageId: r.id })).toMatchObject({ ok: false, error: "not_found" });
  expect(call(app, carol.id, "pins.list", { channelId: general.id }).pins).toEqual([]);
  expect(call(app, carol.id, "pins.list", { channelId: exec.id })).toMatchObject({ ok: false, error: "not_found" });
});

it("guests cannot pin; replies cannot be pinned; deleted messages drop out", () => {
  const { app, carol, dave, gus, general, partners } = setup();
  const p = app.messages.post(carol.id, partners.id, "partner agenda");
  expect(call(app, gus.id, "pins.add", { channelId: partners.id, messageId: p.id })).toMatchObject({ ok: false, error: "forbidden" });
  expect(call(app, gus.id, "pins.list", { channelId: partners.id }).ok).toBe(true);
  const parent = app.messages.post(carol.id, general.id, "parent");
  const reply = app.messages.post(dave.id, general.id, "reply", { parentId: parent.id });
  expect(call(app, carol.id, "pins.add", { channelId: general.id, messageId: reply.id })).toMatchObject({ ok: false, error: "invalid_arguments" });
  call(app, carol.id, "pins.add", { channelId: general.id, messageId: parent.id });
  app.messages.delete(carol.id, parent.id);
  expect(call(app, carol.id, "pins.list", { channelId: general.id }).pins).toEqual([]);
});
