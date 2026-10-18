import { describe, it, expect } from "testkit";
import { signV1 } from "../src/integrations/signing";
import type { HttpTransport } from "../src/integrations/outgoingWebhooks";
import { hmacHex, timingSafeEqual } from "../src/util/hash";
import { setup } from "./fixtures";
import { TokenBucket } from "../src/ratelimit/rateLimiter";
import { ManualClock } from "../src/util/clock";

describe("hash primitives", () => {
  it("hmac is deterministic and key-dependent", () => {
    expect(hmacHex("k", "msg")).toBe(hmacHex("k", "msg"));
    expect(hmacHex("k", "msg")).not.toBe(hmacHex("k2", "msg"));
    expect(hmacHex("k", "msg")).toHaveLength(64);
  });
  it("timingSafeEqual", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("incoming webhooks", () => {
  it("posts signed payloads as the hook's bot", () => {
    const { app, bob, general } = setup();
    const hook = app.incomingWebhooks.create(bob.id, general.id, { name: "CI" });
    const body = JSON.stringify({ text: "build #42 passed" });
    const res = app.incomingWebhooks.receive({ hookId: hook.id, headers: { "X-Steer-Signature": signV1(hook.secret, body) }, body });
    expect(res.status).toBe(200);
    const msg = app.db.messages.get(res.body.messageId!)!;
    expect(msg.authorId).toBe(hook.botUserId);
    expect(app.users.get(hook.botUserId).isBot).toBe(true);
  });

  it("rejects bad signatures, unknown hooks and junk payloads", () => {
    const { app, bob, general } = setup();
    const hook = app.incomingWebhooks.create(bob.id, general.id, { name: "CI" });
    const body = JSON.stringify({ text: "hi" });
    expect(app.incomingWebhooks.receive({ hookId: hook.id, headers: { "x-steer-signature": "v1=deadbeef" }, body }).status).toBe(401);
    expect(app.incomingWebhooks.receive({ hookId: "wh_999999", headers: {}, body }).status).toBe(404);
    const junk = "not json";
    expect(app.incomingWebhooks.receive({ hookId: hook.id, headers: { "x-steer-signature": signV1(hook.secret, junk) }, body: junk }).status).toBe(400);
  });

  it("only admins can create hooks", () => {
    const { app, carol, general } = setup();
    expect(() => app.incomingWebhooks.create(carol.id, general.id, { name: "x" })).toThrow("only admins");
  });
});

describe("outgoing webhooks", () => {
  it("delivers signed events and retries with backoff", async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const statuses = [500, 200];
    const transport: HttpTransport = {
      post: async (url, req) => {
        calls.push({ url, ...req });
        return { status: statuses.shift() ?? 200 };
      },
    };
    const { app, clock, ws, bob, carol, general } = setup({ transport });
    const bot = app.users.create({ handle: "standup-bot", isBot: true });
    app.workspaces.addMember(bob.id, ws.id, bot.id);
    const sub = app.outgoingWebhooks.subscribe(bob.id, ws.id, { botUserId: bot.id, url: "https://bot.example/hook", events: ["message.created"] });
    app.messages.post(carol.id, general.id, "hello bot");
    expect(await app.outgoingWebhooks.flush()).toBe(0);
    expect(await app.outgoingWebhooks.flush()).toBe(0); // backoff not elapsed
    clock.advance(app.config.webhooks.retryBaseMs);
    expect(await app.outgoingWebhooks.flush()).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers["x-steer-signature"]).toBe(signV1(sub.secret, calls[1].body));
    expect(JSON.parse(calls[1].body).event.text).toBe("hello bot");
  });
});

describe("rate limiting", () => {
  it("token bucket refills continuously", () => {
    const clock = new ManualClock(0);
    const b = new TokenBucket(2, 1, clock);
    expect(b.tryTake()).toBe(0);
    expect(b.tryTake()).toBe(0);
    expect(b.tryTake()).toBe(1000);
    clock.advance(500);
    expect(b.tryTake()).toBe(500);
    clock.advance(500);
    expect(b.tryTake()).toBe(0);
  });

  it("api returns rate_limited with retryAfterMs", () => {
    const { app, carol, general } = setup({ config: { rateLimits: { default: { capacity: 50, refillPerSecond: 10 }, "chat.write": { capacity: 2, refillPerSecond: 1 } } } });
    const post = () => app.api.handle({ command: "chat.postMessage", actorId: carol.id, params: { channelId: general.id, text: "spam" } });
    expect(post().ok).toBe(true);
    expect(post().ok).toBe(true);
    const r = post();
    expect(r).toMatchObject({ ok: false, error: "rate_limited", retryAfterMs: 1000 });
  });
});

describe("api router", () => {
  it("dispatches commands and wraps results", () => {
    const { app, carol, general } = setup();
    const r = app.api.handle({ command: "chat.postMessage", actorId: carol.id, params: { channelId: general.id, text: "hi" } });
    expect(r.ok).toBe(true);
    expect((r as any).message.text).toBe("hi");
    const h = app.api.handle({ command: "conversations.history", actorId: carol.id, params: { channelId: general.id } });
    expect((h as any).messages).toHaveLength(1);
  });

  it("maps errors to codes", () => {
    const { app, carol, exec } = setup();
    expect(app.api.handle({ command: "nope", actorId: carol.id })).toMatchObject({ ok: false, error: "unknown_command" });
    expect(app.api.handle({ command: "chat.postMessage", actorId: "u_999999", params: {} })).toMatchObject({ ok: false, error: "not_authed" });
    expect(app.api.handle({ command: "chat.postMessage", actorId: carol.id, params: { channelId: "general", text: "x" } })).toMatchObject({
      ok: false,
      error: "invalid_arguments",
      message: "channelId must be a c_ id",
    });
    expect(app.api.handle({ command: "chat.postMessage", actorId: carol.id, params: { channelId: exec.id, text: "x" } })).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  it("threads and reactions through the api", () => {
    const { app, carol, dave, general } = setup();
    const p = app.api.handle({ command: "chat.postMessage", actorId: carol.id, params: { channelId: general.id, text: "parent" } }) as any;
    app.api.handle({ command: "chat.postMessage", actorId: dave.id, params: { channelId: general.id, text: "child", threadId: p.message.id } });
    const t = app.api.handle({ command: "chat.replies", actorId: carol.id, params: { messageId: p.message.id } }) as any;
    expect(t.replies.map((r: any) => r.text)).toEqual(["child"]);
    expect(app.api.handle({ command: "reactions.add", actorId: dave.id, params: { messageId: p.message.id, emoji: "eyes" } })).toEqual({ ok: true, changed: true });
  });
});
