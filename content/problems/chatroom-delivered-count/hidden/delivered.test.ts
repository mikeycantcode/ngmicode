import { it, expect } from "testkit";
import { setup } from "../fixtures";

const post = (app: any, actorId: string, params: Record<string, unknown>) => app.api.handle({ command: "chat.postMessage", actorId, params });

it("counts every member connection exactly once and delivers once", async () => {
  const { app, bob, carol, gus, general } = setup();
  const c1 = app.connect(carol.id);
  const c2 = app.connect(carol.id);
  const b1 = app.connect(bob.id);
  const g1 = app.connect(gus.id); // not a #general member
  // alice and dave have no connections
  const r = post(app, carol.id, { channelId: general.id, text: "ship it" });
  expect(r.ok).toBe(true);
  expect(r.deliveredTo).toBe(3);
  await app.hub.idle();
  for (const c of [c1, c2, b1]) {
    expect(c.received.filter((f: any) => f.type === "message.created" && f.payload.message.id === r.message.id)).toHaveLength(1);
  }
  expect(g1.types()).not.toContain("message.created");
});

it("works for thread replies and private channels; errors have no count", () => {
  const { app, alice, bob, carol, exec, general } = setup();
  app.connect(alice.id);
  const p = post(app, bob.id, { channelId: exec.id, text: "board prep" });
  expect(p.deliveredTo).toBe(1);
  app.connect(bob.id);
  app.connect(bob.id);
  const reply = post(app, alice.id, { channelId: exec.id, text: "on it", threadId: p.message.id });
  expect(reply.ok).toBe(true);
  expect(reply.deliveredTo).toBe(3);
  const denied = post(app, carol.id, { channelId: exec.id, text: "let me in" });
  expect(denied.ok).toBe(false);
  expect(denied.deliveredTo).toBeUndefined();
  expect(post(app, carol.id, { channelId: general.id, text: "hello general" }).deliveredTo).toBe(3);
});
