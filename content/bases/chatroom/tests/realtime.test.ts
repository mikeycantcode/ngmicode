import { describe, it, expect } from "testkit";
import { MINUTE } from "../src/util/clock";
import { setup, settle } from "./fixtures";

describe("presence", () => {
  it("offline without connections, active after activity, away when idle", () => {
    const { app, clock, carol } = setup();
    expect(app.presence.status(carol.id)).toBe("offline");
    app.connect(carol.id);
    app.presence.touch(carol.id);
    expect(app.presence.status(carol.id)).toBe("active");
    clock.advance(10 * MINUTE - 1);
    expect(app.presence.status(carol.id)).toBe("active");
    clock.advance(1);
    expect(app.presence.status(carol.id)).toBe("away");
  });

  it("emits presence.changed on sweep and disconnect", () => {
    const { app, clock, carol } = setup();
    const seen: string[] = [];
    app.bus.on("presence.changed", (e) => seen.push(e.status));
    const conn = app.connect(carol.id);
    app.presence.touch(carol.id);
    clock.advance(11 * MINUTE);
    app.presence.sweep();
    app.hub.unregister(conn.id);
    expect(seen).toEqual(["away", "active", "away", "offline"]);
  });
});

describe("typing", () => {
  it("throttles events and expires indicators", () => {
    const { app, clock, carol, dave, general } = setup();
    expect(app.typing.start(carol.id, general.id)).toBe(true);
    clock.advance(1000);
    expect(app.typing.start(carol.id, general.id)).toBe(false);
    app.typing.start(dave.id, general.id);
    expect(app.typing.active(general.id)).toEqual([carol.id, dave.id]);
    clock.advance(6000);
    expect(app.typing.active(general.id)).toEqual([]);
  });

  it("posting clears the indicator", () => {
    const { app, carol, general } = setup();
    app.typing.start(carol.id, general.id);
    app.messages.post(carol.id, general.id, "done typing");
    expect(app.typing.active(general.id)).toEqual([]);
  });
});

describe("delivery", () => {
  it("fans message events out to every connection of every member", async () => {
    const { app, carol, dave, gus, general } = setup();
    const c1 = app.connect(carol.id);
    const c2 = app.connect(carol.id);
    const d1 = app.connect(dave.id);
    const g1 = app.connect(gus.id);
    app.messages.post(carol.id, general.id, "hello");
    await app.hub.idle();
    for (const c of [c1, c2, d1]) expect(c.types()).toContain("message.created");
    expect(g1.types()).not.toContain("message.created");
  });

  it("assigns increasing per-connection seq numbers", async () => {
    const { app, carol, general } = setup();
    const c = app.connect(carol.id);
    app.messages.post(carol.id, general.id, "one");
    app.messages.post(carol.id, general.id, "two");
    await app.hub.idle();
    const seqs = c.received.map((f) => f.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("does not echo typing to the typist", async () => {
    const { app, carol, dave, general } = setup();
    const c = app.connect(carol.id);
    const d = app.connect(dave.id);
    app.typing.start(carol.id, general.id);
    await app.hub.idle();
    expect(c.types()).not.toContain("typing");
    expect(d.types()).toContain("typing");
  });

  it("a slow connection does not block others and keeps its order", async () => {
    const { app, carol, dave, general } = setup();
    const slow = app.connect(carol.id, { manual: true });
    const fast = app.connect(dave.id);
    app.messages.post(dave.id, general.id, "a");
    app.messages.post(dave.id, general.id, "b");
    await settle();
    expect(fast.received.filter((f) => f.type === "message.created")).toHaveLength(2);
    expect(slow.received).toHaveLength(0);
    await slow.releaseAll();
    const texts = slow.received
      .filter((f) => f.type === "message.created")
      .map((f) => (f.payload as { message: { text: string } }).message.text);
    expect(texts).toEqual(["a", "b"]);
  });

  it("closes a connection whose socket write fails", async () => {
    const { app, carol, general } = setup();
    const c = app.connect(carol.id);
    c.failNext(3);
    app.messages.post(carol.id, general.id, "boom");
    await settle();
    expect(c.closedReason).toBe("send_failed");
    expect(app.hub.connectionsFor(carol.id)).toHaveLength(0);
  });
});
