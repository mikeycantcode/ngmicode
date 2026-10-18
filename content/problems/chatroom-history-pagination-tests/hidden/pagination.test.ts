import { it, expect } from "testkit";
import { collectHistory, seedMessages } from "../helpers/seed";
import { setup } from "../fixtures";

it("seedMessages honors its contract", () => {
  const { app, clock, carol, general } = setup();
  const t0 = clock.now();
  const a = seedMessages(app, { channelId: general.id, authorId: carol.id, count: 3 });
  expect(a.map((m) => m.text)).toEqual(["msg 1", "msg 2", "msg 3"]);
  expect(a.map((m) => m.createdAt - t0)).toEqual([1000, 2000, 3000]);
  const b = seedMessages(app, { channelId: general.id, authorId: carol.id, count: 2, stepMs: 0, text: (i) => `burst ${i}` });
  expect(b.map((m) => m.text)).toEqual(["burst 1", "burst 2"]);
  expect(b.map((m) => m.createdAt)).toEqual([a[2].createdAt, a[2].createdAt]);
  expect(app.history.history(carol.id, general.id).messages).toHaveLength(5);
});

it("pages through a same-millisecond burst without losing messages", () => {
  const { app, carol, general } = setup();
  seedMessages(app, { channelId: general.id, authorId: carol.id, count: 7, stepMs: 0 });
  const all = collectHistory(app, carol.id, general.id, 3);
  expect(all.map((m) => m.text)).toEqual(["msg 7", "msg 6", "msg 5", "msg 4", "msg 3", "msg 2", "msg 1"]);
});

it("returns every visible message exactly once for mixed timing and deletions", () => {
  const { app, carol, general } = setup();
  const first = seedMessages(app, { channelId: general.id, authorId: carol.id, count: 3, text: (i) => `a${i}` });
  const burst = seedMessages(app, { channelId: general.id, authorId: carol.id, count: 5, stepMs: 0, text: (i) => `b${i}` });
  const late = seedMessages(app, { channelId: general.id, authorId: carol.id, count: 2, stepMs: 1, text: (i) => `c${i}` });
  app.messages.delete(carol.id, burst[2].id);
  for (const size of [1, 2, 4]) {
    const ids = collectHistory(app, carol.id, general.id, size).map((m) => m.id);
    const expected = [...first, ...burst, ...late].filter((m) => m.id !== burst[2].id).reverse().map((m) => m.id);
    expect(ids).toEqual(expected);
  }
});
