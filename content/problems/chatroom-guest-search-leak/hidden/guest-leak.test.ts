import { it, expect } from "testkit";
import { setup } from "../fixtures";

it("guests only find messages from channels they were added to", () => {
  const { app, ws, carol, gus, general, partners } = setup();
  app.messages.post(carol.id, general.id, "roadmap internal pricing");
  app.messages.post(carol.id, partners.id, "roadmap shared with partner");
  const hits = app.search.search(gus.id, ws.id, "roadmap");
  expect(hits.map((h) => h.message.channelId)).toEqual([partners.id]);
  const api = app.api.handle({ command: "search.messages", actorId: gus.id, params: { workspaceId: ws.id, query: "pricing" } }) as any;
  expect(api.matches).toEqual([]);
});

it("thread replies are not readable without channel access", () => {
  const { app, alice, bob, carol, gus, exec, general } = setup();
  const parent = app.messages.post(bob.id, exec.id, "acquisition talks");
  app.messages.post(alice.id, exec.id, "price is 40M", { parentId: parent.id });
  const r = app.api.handle({ command: "chat.replies", actorId: carol.id, params: { messageId: parent.id } });
  expect(r).toMatchObject({ ok: false, error: "not_found" });
  expect(() => app.threads.getThread(carol.id, parent.id)).toThrow();
  const pub = app.messages.post(carol.id, general.id, "general thread");
  app.messages.post(bob.id, general.id, "general reply", { parentId: pub.id });
  expect(app.api.handle({ command: "chat.replies", actorId: gus.id, params: { messageId: pub.id } }).ok).toBe(false);
});

it("legitimate reads still work", () => {
  const { app, ws, alice, bob, carol, dave, exec, random } = setup();
  app.messages.post(carol.id, random.id, "standup notes");
  // dave is a full member but hasn't joined #random: public channels stay searchable
  expect(app.search.search(dave.id, ws.id, "standup")).toHaveLength(1);
  const parent = app.messages.post(bob.id, exec.id, "board deck");
  app.messages.post(bob.id, exec.id, "draft attached", { parentId: parent.id });
  expect(app.threads.getThread(alice.id, parent.id).replies).toHaveLength(1);
  expect(app.search.search(alice.id, ws.id, "board")).toHaveLength(1);
});
