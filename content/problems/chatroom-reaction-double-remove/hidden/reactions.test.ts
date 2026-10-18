import { it, expect } from "testkit";
import { setup } from "../fixtures";

it("a duplicate or bogus remove never removes someone else's reaction", () => {
  const { app, alice, carol, dave, general } = setup();
  const m = app.messages.post(carol.id, general.id, "deploying v2");
  app.reactions.add(carol.id, m.id, "white_check_mark");
  app.reactions.add(dave.id, m.id, "white_check_mark");
  expect(app.reactions.remove(dave.id, m.id, "white_check_mark")).toBe(true);
  expect(app.reactions.remove(dave.id, m.id, "white_check_mark")).toBe(false);
  expect(app.reactions.remove(alice.id, m.id, "white_check_mark")).toBe(false);
  expect(app.reactions.summary(carol.id, m.id)).toEqual([{ emoji: "white_check_mark", count: 1, users: [carol.id] }]);
});

it("a no-op remove emits nothing and reports changed: false", async () => {
  const { app, carol, dave, general } = setup();
  const m = app.messages.post(carol.id, general.id, "hi");
  app.reactions.add(carol.id, m.id, "wave");
  const conn = app.connect(carol.id);
  let events = 0;
  app.bus.on("reaction.removed", () => events++);
  const r = app.api.handle({ command: "reactions.remove", actorId: dave.id, params: { messageId: m.id, emoji: "wave" } });
  expect(r).toEqual({ ok: true, changed: false });
  await app.hub.idle();
  expect(events).toBe(0);
  expect(conn.types()).not.toContain("reaction.removed");
  expect(app.reactions.summary(carol.id, m.id)).toEqual([{ emoji: "wave", count: 1, users: [carol.id] }]);
});
