import { describe, it, expect } from "testkit";
import { setup } from "./fixtures";

describe("search", () => {
  it("finds messages by terms, newest first, with prefix on last term", () => {
    const { app, clock, ws, carol, general } = setup();
    app.messages.post(carol.id, general.id, "deploy failed on staging");
    clock.advance(10);
    app.messages.post(carol.id, general.id, "deployment succeeded");
    const hits = app.search.search(carol.id, ws.id, "deploy");
    expect(hits.map((h) => h.message.text)).toEqual(["deployment succeeded", "deploy failed on staging"]);
    expect(app.search.search(carol.id, ws.id, "deploy staging")).toHaveLength(1);
  });

  it("reflects edits and deletes", () => {
    const { app, ws, carol, general } = setup();
    const m = app.messages.post(carol.id, general.id, "banana bread");
    app.messages.edit(carol.id, m.id, "apple pie");
    expect(app.search.search(carol.id, ws.id, "banana")).toHaveLength(0);
    expect(app.search.search(carol.id, ws.id, "apple")).toHaveLength(1);
    app.messages.delete(carol.id, m.id);
    expect(app.search.search(carol.id, ws.id, "apple")).toHaveLength(0);
  });

  it("supports from: and in: filters", () => {
    const { app, ws, carol, dave, general, random } = setup();
    app.channels.join(dave.id, random.id);
    app.messages.post(carol.id, general.id, "quarterly numbers");
    app.messages.post(dave.id, random.id, "quarterly vibes");
    expect(app.search.search(carol.id, ws.id, "quarterly from:@dave").map((h) => h.message.text)).toEqual(["quarterly vibes"]);
    expect(app.search.search(carol.id, ws.id, "quarterly in:#general").map((h) => h.message.text)).toEqual(["quarterly numbers"]);
  });

  it("does not return messages from private channels the actor isn't in", () => {
    const { app, ws, bob, carol, exec } = setup();
    app.messages.post(bob.id, exec.id, "layoffs planned");
    expect(app.search.search(carol.id, ws.id, "layoffs")).toHaveLength(0);
    expect(app.search.search(bob.id, ws.id, "layoffs")).toHaveLength(1);
  });
});

describe("notifications", () => {
  it("notifies mentioned users with a rendered preview", () => {
    const { app, carol, dave, general } = setup();
    app.messages.post(carol.id, general.id, "@dave can you   review\n#random?");
    const inbox = app.notifications.inbox(dave.id);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].reason).toBe("mention");
    expect(inbox[0].preview).toBe("@Dave can you review #random?");
  });

  it("does not notify mentioned users who cannot read the channel", () => {
    const { app, bob, carol, exec } = setup();
    app.messages.post(bob.id, exec.id, "ask @carol about it");
    expect(app.notifications.inbox(carol.id)).toHaveLength(0);
  });

  it("@here only reaches active members; DMs notify the other side", () => {
    const { app, ws, alice, carol, dave, general } = setup();
    app.connect(dave.id);
    app.presence.touch(dave.id);
    app.messages.post(alice.id, general.id, "@here standup");
    expect(app.notifications.inbox(dave.id).map((n) => n.reason)).toEqual(["broadcast"]);
    expect(app.notifications.inbox(carol.id)).toHaveLength(0);
    const dm = app.channels.openDm(carol.id, ws.id, [dave.id]);
    app.messages.post(carol.id, dm.id, "psst");
    expect(app.notifications.inbox(dave.id)[0].reason).toBe("dm");
  });

  it("thread replies notify the parent author and participants", () => {
    const { app, alice, carol, dave, general } = setup();
    const parent = app.messages.post(carol.id, general.id, "thoughts?");
    app.messages.post(dave.id, general.id, "yes", { parentId: parent.id });
    app.messages.post(alice.id, general.id, "agreed", { parentId: parent.id });
    expect(app.notifications.inbox(carol.id).map((n) => n.reason)).toEqual(["thread_reply", "thread_reply"]);
    expect(app.notifications.inbox(dave.id).map((n) => n.reason)).toEqual(["thread_reply"]);
  });
});
