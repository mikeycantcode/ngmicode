import { it, expect } from "testkit";
import { setup } from "../fixtures";

function seed(n: number) {
  const w = setup();
  const msgs = [];
  for (let i = 1; i <= n; i++) {
    w.clock.advance(1000);
    msgs.push(w.app.messages.post(w.carol.id, w.general.id, `m${i}`));
  }
  return { ...w, msgs };
}
const texts = (r: { messages: { text: string }[] }) => r.messages.map((m) => m.text);

it("centers the window with the odd slot going to newer messages", () => {
  const { app, carol, general, msgs } = seed(10);
  const r = app.history.around(carol.id, general.id, msgs[4].id, 4);
  expect(texts(r)).toEqual(["m4", "m5", "m6", "m7"]);
  expect(r.hasMoreBefore).toBe(true);
  expect(r.hasMoreAfter).toBe(true);
  const one = app.history.around(carol.id, general.id, msgs[4].id, 1);
  expect(texts(one)).toEqual(["m5"]);
});

it("redistributes unused slots at either end", () => {
  const { app, carol, general, msgs } = seed(10);
  const start = app.history.around(carol.id, general.id, msgs[1].id, 5);
  expect(texts(start)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  expect([start.hasMoreBefore, start.hasMoreAfter]).toEqual([false, true]);
  const end = app.history.around(carol.id, general.id, msgs[9].id, 3);
  expect(texts(end)).toEqual(["m8", "m9", "m10"]);
  expect([end.hasMoreBefore, end.hasMoreAfter]).toEqual([true, false]);
  const all = app.history.around(carol.id, general.id, msgs[5].id, 50);
  expect(all.messages).toHaveLength(10);
  expect([all.hasMoreBefore, all.hasMoreAfter]).toEqual([false, false]);
});

it("skips deleted messages and thread replies; orders same-timestamp messages by id", () => {
  const { app, clock, carol, dave, general } = setup();
  clock.advance(1000);
  const a = app.messages.post(carol.id, general.id, "a");
  const b = app.messages.post(carol.id, general.id, "b"); // same ms as a
  const c = app.messages.post(carol.id, general.id, "c"); // same ms
  app.messages.post(dave.id, general.id, "reply", { parentId: b.id });
  clock.advance(1000);
  const d = app.messages.post(carol.id, general.id, "d");
  const e = app.messages.post(carol.id, general.id, "e");
  app.messages.delete(carol.id, d.id);
  const r = app.history.around(carol.id, general.id, c.id, 3);
  expect(texts(r)).toEqual(["b", "c", "e"]);
  expect([r.hasMoreBefore, r.hasMoreAfter]).toEqual([true, false]);
  expect(a.createdAt).toBe(c.createdAt);
});

it("checks access, then limit, then anchor", () => {
  const { app, bob, carol, dave, general, exec, random, msgs } = seed(3);
  const execMsg = app.messages.post(bob.id, exec.id, "secret");
  expect(() => app.history.around(carol.id, exec.id, execMsg.id, 0)).toThrow("channel not found");
  expect(() => app.history.around(carol.id, general.id, msgs[0].id, 0)).toThrow("limit must be between 1 and 50");
  expect(() => app.history.around(carol.id, general.id, msgs[0].id, 51)).toThrow("limit must be between 1 and 50");
  expect(() => app.history.around(carol.id, general.id, msgs[0].id, 2.5)).toThrow("limit must be between 1 and 50");
  const reply = app.messages.post(dave.id, general.id, "r", { parentId: msgs[0].id });
  expect(() => app.history.around(carol.id, general.id, reply.id, 5)).toThrow("message not found");
  const elsewhere = app.messages.post(carol.id, random.id, "x");
  expect(() => app.history.around(carol.id, general.id, elsewhere.id, 5)).toThrow("message not found");
  app.messages.delete(carol.id, msgs[1].id);
  expect(() => app.history.around(carol.id, general.id, msgs[1].id, 5)).toThrow("message not found");
});
