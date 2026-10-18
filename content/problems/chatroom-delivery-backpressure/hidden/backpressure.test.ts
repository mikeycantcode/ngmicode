import { it, expect } from "testkit";
import { setup, settle } from "../fixtures";

const world = (maxQueue: number) => setup({ config: { delivery: { maxQueue } } });
const typing = (app: any, channelId: string, userId: string) => app.fanout.publish(channelId, "typing", { channelId, userId });
const texts = (conn: any) => conn.received.filter((f: any) => f.type === "message.created").map((f: any) => f.payload.message.text);

it("disconnects a slow consumer once its queue is full of durable frames", async () => {
  const { app, carol, dave, general } = world(3);
  const slow = app.connect(carol.id);
  const fast = app.connect(dave.id);
  await app.hub.idle();
  slow.setManual(true);
  for (let i = 1; i <= 4; i++) app.messages.post(dave.id, general.id, `m${i}`);
  await settle();
  expect(slow.closed).toBe(false); // 1 in flight + 3 waiting
  app.messages.post(dave.id, general.id, "m5");
  await settle();
  expect(slow.closedReason).toBe("slow_consumer");
  expect(app.hub.connectionsFor(carol.id)).toHaveLength(0);
  expect(app.presence.status(carol.id)).toBe("offline");
  await app.hub.idle();
  expect(texts(fast)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
});

it("sheds ephemeral frames before durable ones when full", async () => {
  const { app, carol, dave, bob, general } = world(3);
  const conn = app.connect(carol.id);
  await app.hub.idle();
  conn.setManual(true);
  app.messages.post(dave.id, general.id, "m0"); // in flight
  typing(app, general.id, dave.id);
  app.messages.post(dave.id, general.id, "m1");
  app.messages.post(dave.id, general.id, "m2"); // waiting: [typing, m1, m2]
  app.messages.post(dave.id, general.id, "m3"); // full -> typing dropped
  typing(app, general.id, bob.id); // full, nothing ephemeral waiting -> new frame dropped
  await settle();
  expect(conn.closed).toBe(false);
  expect(app.hub.queueSize(conn.id)).toBe(3);
  await conn.releaseAll();
  expect(texts(conn)).toEqual(["m0", "m1", "m2", "m3"]);
  expect(conn.types()).not.toContain("typing");
});

it("coalesces waiting typing and presence frames (remove old, append new)", async () => {
  const { app, alice, bob, carol, dave, general } = world(10);
  const conn = app.connect(carol.id);
  await app.hub.idle();
  const already = conn.received.length;
  conn.setManual(true);
  app.messages.post(dave.id, general.id, "m0"); // in flight
  typing(app, general.id, dave.id);
  typing(app, general.id, bob.id);
  typing(app, general.id, dave.id);
  app.fanout.publishToUsers([carol.id], "presence.changed", { userId: alice.id, status: "away" });
  app.fanout.publishToUsers([carol.id], "presence.changed", { userId: alice.id, status: "active" });
  await conn.releaseAll();
  const eph = conn.received.slice(already).filter((f) => f.ephemeral).map((f) => [f.type, (f.payload as any).userId, (f.payload as any).status]);
  expect(eph).toEqual([
    ["typing", bob.id, undefined],
    ["typing", dave.id, undefined],
    ["presence.changed", alice.id, "active"],
  ]);
});

it("retries failed writes in place, then gives up after three attempts", async () => {
  const { app, carol, dave, general } = world(10);
  const conn = app.connect(carol.id);
  await app.hub.idle();
  const before = conn.attempts.length;
  conn.failNext(2);
  app.messages.post(dave.id, general.id, "a");
  app.messages.post(dave.id, general.id, "b");
  await settle(50);
  expect(conn.closed).toBe(false);
  expect(texts(conn)).toEqual(["a", "b"]);
  expect(conn.attempts.length - before).toBe(4);
  conn.failNext(3);
  app.messages.post(dave.id, general.id, "c");
  await settle(50);
  expect(conn.closedReason).toBe("send_failed");
  expect(texts(conn)).toEqual(["a", "b"]);
});
