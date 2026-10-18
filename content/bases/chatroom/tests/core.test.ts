import { describe, it, expect } from "testkit";
import { setup } from "./fixtures";

describe("workspaces & roles", () => {
  it("creates #general and auto-joins non-guest members", () => {
    const { app, general, alice, bob, carol, dave, gus } = setup();
    expect(general.isGeneral).toBe(true);
    const members = app.db.channelMemberIds(general.id);
    expect(members).toContain(alice.id);
    expect(members).toContain(bob.id);
    expect(members).toContain(carol.id);
    expect(members).toContain(dave.id);
    expect(members).not.toContain(gus.id);
  });

  it("only admins can add members", () => {
    const { app, ws, carol } = setup();
    const eve = app.users.create({ handle: "eve" });
    expect(() => app.workspaces.addMember(carol.id, ws.id, eve.id)).toThrow("only admins");
  });

  it("role changes respect rank", () => {
    const { app, ws, alice, bob, carol, dave } = setup();
    expect(app.workspaces.setRole(alice.id, ws.id, carol.id, "admin").role).toBe("admin");
    expect(() => app.workspaces.setRole(bob.id, ws.id, carol.id, "member")).toThrow("cannot assign");
    expect(() => app.workspaces.setRole(dave.id, ws.id, carol.id, "member")).toThrow("cannot assign");
  });

  it("rejects reserved and duplicate handles", () => {
    const { app } = setup();
    expect(() => app.users.create({ handle: "here" })).toThrow("reserved");
    expect(() => app.users.create({ handle: "alice" })).toThrow("taken");
    expect(() => app.users.create({ handle: "-bad" })).toThrow("invalid handle");
  });
});

describe("channels", () => {
  it("normalizes names and rejects duplicates", () => {
    const { app, ws, carol } = setup();
    const ch = app.channels.create(carol.id, ws.id, { name: "  Design Team " });
    expect(ch.name).toBe("design-team");
    expect(() => app.channels.create(carol.id, ws.id, { name: "design team" })).toThrow("already taken");
  });

  it("guests cannot create or join public channels", () => {
    const { app, ws, gus, random } = setup();
    expect(() => app.channels.create(gus.id, ws.id, { name: "mine" })).toThrow("guests cannot");
    expect(() => app.channels.join(gus.id, random.id)).toThrow("cannot join");
  });

  it("private channels look like they don't exist to outsiders", () => {
    const { app, carol, exec } = setup();
    expect(() => app.channels.join(carol.id, exec.id)).toThrow("channel not found");
    expect(() => app.history.history(carol.id, exec.id)).toThrow("channel not found");
  });

  it("list shows readable channels only", () => {
    const { app, ws, carol, gus, alice } = setup();
    expect(app.channels.list(carol.id, ws.id).map((c) => c.name)).toEqual(["general", "partners", "random"]);
    expect(app.channels.list(gus.id, ws.id).map((c) => c.name)).toEqual(["partners"]);
    expect(app.channels.list(alice.id, ws.id).map((c) => c.name)).toEqual(["exec", "general", "partners", "random"]);
  });

  it("DMs are reused for the same participant set", () => {
    const { app, ws, carol, dave } = setup();
    const a = app.channels.openDm(carol.id, ws.id, [dave.id]);
    const b = app.channels.openDm(dave.id, ws.id, [carol.id]);
    expect(a.id).toBe(b.id);
    expect(a.kind).toBe("dm");
  });

  it("cannot leave #general; rename requires manager", () => {
    const { app, carol, dave, general, random } = setup();
    expect(() => app.channels.leave(carol.id, general.id)).toThrow("cannot leave #general");
    expect(() => app.channels.rename(dave.id, random.id, "fun")).toThrow("cannot rename");
    expect(app.channels.rename(carol.id, random.id, "Fun Stuff").name).toBe("fun-stuff");
  });
});

describe("messages", () => {
  it("posts with canonical mentions", () => {
    const { app, carol, dave, general, random } = setup();
    const m = app.messages.post(carol.id, general.id, "hey @dave, see #random <b>");
    expect(m.text).toBe(`hey <@${dave.id}>, see <#${random.id}> &lt;b&gt;`);
    expect(m.mentions).toEqual([
      { kind: "user", userId: dave.id },
      { kind: "channel", channelId: random.id },
    ]);
  });

  it("users cannot smuggle canonical tokens in raw text", () => {
    const { app, carol, general } = setup();
    const m = app.messages.post(carol.id, general.id, "<!everyone> <@u_000001>");
    expect(m.mentions).toEqual([]);
  });

  it("enforces broadcast permissions", () => {
    const { app, carol, alice, general } = setup();
    expect(() => app.messages.post(carol.id, general.id, "@everyone lunch")).toThrow("not allowed to use @everyone");
    expect(app.messages.post(carol.id, general.id, "@here lunch").mentions).toEqual([{ kind: "broadcast", scope: "here" }]);
    expect(app.messages.post(alice.id, general.id, "@everyone lunch").mentions).toHaveLength(1);
  });

  it("requires membership to post", () => {
    const { app, dave, random } = setup();
    expect(() => app.messages.post(dave.id, random.id, "hi")).toThrow("join the channel");
    app.channels.join(dave.id, random.id);
    expect(app.messages.post(dave.id, random.id, "hi").authorId).toBe(dave.id);
  });

  it("only the author edits; author or admin deletes", () => {
    const { app, carol, dave, bob, general } = setup();
    const m = app.messages.post(carol.id, general.id, "typo");
    expect(() => app.messages.edit(dave.id, m.id, "hacked")).toThrow("only the author");
    const edited = app.messages.edit(carol.id, m.id, "fixed");
    expect(edited.text).toBe("fixed");
    expect(edited.editedAt).not.toBeNull();
    expect(() => app.messages.delete(dave.id, m.id)).toThrow("cannot delete");
    app.messages.delete(bob.id, m.id);
    expect(() => app.messages.get(carol.id, m.id)).toThrow("message not found");
  });

  it("threads: replies count and stay out of channel history", () => {
    const { app, carol, dave, general } = setup();
    const parent = app.messages.post(carol.id, general.id, "thread me");
    app.messages.post(dave.id, general.id, "reply 1", { parentId: parent.id });
    const r2 = app.messages.post(carol.id, general.id, "reply 2", { parentId: parent.id });
    expect(() => app.messages.post(dave.id, general.id, "nested", { parentId: r2.id })).toThrow("cannot reply to a thread reply");
    const t = app.threads.getThread(dave.id, parent.id);
    expect(t.parent.replyCount).toBe(2);
    expect(t.replies.map((r) => r.text)).toEqual(["reply 1", "reply 2"]);
    expect(app.history.history(dave.id, general.id).messages.map((m) => m.text)).toEqual(["thread me"]);
  });
});

describe("reactions", () => {
  it("adds once per user and normalizes :names:", () => {
    const { app, carol, dave, general } = setup();
    const m = app.messages.post(carol.id, general.id, "ship it");
    expect(app.reactions.add(dave.id, m.id, ":Rocket:")).toBe(true);
    expect(app.reactions.add(dave.id, m.id, "rocket")).toBe(false);
    app.reactions.add(carol.id, m.id, "rocket");
    expect(app.reactions.summary(carol.id, m.id)).toEqual([{ emoji: "rocket", count: 2, users: [dave.id, carol.id] }]);
  });

  it("removes only the actor's reaction and drops empty emoji", () => {
    const { app, carol, dave, general } = setup();
    const m = app.messages.post(carol.id, general.id, "ship it");
    app.reactions.add(dave.id, m.id, "tada");
    app.reactions.add(carol.id, m.id, "tada");
    expect(app.reactions.remove(dave.id, m.id, "tada")).toBe(true);
    expect(app.reactions.summary(carol.id, m.id)).toEqual([{ emoji: "tada", count: 1, users: [carol.id] }]);
    app.reactions.remove(carol.id, m.id, "tada");
    expect(app.reactions.summary(carol.id, m.id)).toEqual([]);
  });

  it("rejects junk emoji", () => {
    const { app, carol, general } = setup();
    const m = app.messages.post(carol.id, general.id, "x");
    expect(() => app.reactions.add(carol.id, m.id, "<script>")).toThrow("invalid emoji");
  });
});

describe("history pagination", () => {
  it("pages newest-first with a cursor", () => {
    const { app, clock, carol, general } = setup();
    for (let i = 1; i <= 5; i++) {
      clock.advance(1000);
      app.messages.post(carol.id, general.id, `msg ${i}`);
    }
    const p1 = app.history.history(carol.id, general.id, { limit: 2 });
    expect(p1.messages.map((m) => m.text)).toEqual(["msg 5", "msg 4"]);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = app.history.history(carol.id, general.id, { limit: 2, cursor: p1.nextCursor });
    expect(p2.messages.map((m) => m.text)).toEqual(["msg 3", "msg 2"]);
    const p3 = app.history.history(carol.id, general.id, { limit: 2, cursor: p2.nextCursor });
    expect(p3.messages.map((m) => m.text)).toEqual(["msg 1"]);
    expect(p3.nextCursor).toBeNull();
  });

  it("skips deleted messages", () => {
    const { app, clock, carol, general } = setup();
    const a = app.messages.post(carol.id, general.id, "a");
    clock.advance(1);
    app.messages.post(carol.id, general.id, "b");
    app.messages.delete(carol.id, a.id);
    expect(app.history.history(carol.id, general.id).messages.map((m) => m.text)).toEqual(["b"]);
  });

  it("validates limit and cursor", () => {
    const { app, carol, general } = setup();
    expect(() => app.history.history(carol.id, general.id, { limit: 0 })).toThrow("limit must be between 1 and 200");
    expect(() => app.history.history(carol.id, general.id, { cursor: "garbage" })).toThrow("invalid cursor");
  });
});
