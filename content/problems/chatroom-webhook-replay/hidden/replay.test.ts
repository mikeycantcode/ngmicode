import { it, expect } from "testkit";
import type { HttpTransport } from "../../src/integrations/outgoingWebhooks";
import { hmacHex } from "../../src/util/hash";
import { setup } from "../fixtures";

const v2 = (secret: string, ts: number | string, body: string) => `v2=${hmacHex(secret, `v2:${ts}:${body}`)}`;

function world() {
  const w = setup();
  const hook = w.app.incomingWebhooks.create(w.bob.id, w.general.id, { name: "CI" });
  const nowSec = () => Math.floor(w.clock.now() / 1000);
  const send = (body: string, ts: number | string, sig = v2(hook.secret, ts, body)) =>
    w.app.incomingWebhooks.receive({ hookId: hook.id, headers: { "X-Steer-Timestamp": String(ts), "X-Steer-Signature": sig }, body });
  return { ...w, hook, nowSec, send };
}

it("accepts v2 and rejects v1 or tampered requests", () => {
  const { hook, nowSec, send, app } = world();
  const body = JSON.stringify({ text: "deploy ok" });
  const ok = send(body, nowSec());
  expect(ok.status).toBe(200);
  const v1 = `v1=${hmacHex(hook.secret, body)}`;
  expect(send(body, nowSec(), v1)).toEqual({ status: 401, body: { ok: false, error: "invalid_signature" } });
  const sig = v2(hook.secret, nowSec(), body);
  expect(send(JSON.stringify({ text: "deploy FAILED" }), nowSec(), sig).body.error).toBe("invalid_signature");
  expect(app.incomingWebhooks.receive({ hookId: hook.id, headers: { "x-steer-signature": sig }, body }).body.error).toBe("invalid_signature");
});

it("enforces the tolerance window in both directions, inclusive at 5 minutes", () => {
  const { nowSec, send } = world();
  const body = JSON.stringify({ text: "hi" });
  expect(send(body, nowSec() - 300).status).toBe(200);
  expect(send(body, nowSec() - 301)).toEqual({ status: 401, body: { ok: false, error: "stale_request" } });
  expect(send(body, nowSec() + 301).body.error).toBe("stale_request");
  expect(send(body, nowSec() + 300).status).toBe(200);
});

it("rejects replays but accepts the same body with a fresh timestamp", () => {
  const { clock, nowSec, send } = world();
  const body = JSON.stringify({ text: "build #7 passed" });
  const ts = nowSec();
  expect(send(body, ts).status).toBe(200);
  expect(send(body, ts)).toEqual({ status: 409, body: { ok: false, error: "replayed" } });
  clock.advance(1000);
  expect(send(body, nowSec()).status).toBe(200);
  clock.advance(10 * 60 * 1000);
  expect(send(body, ts).body.error).toBe("stale_request");
  expect(send("nope", nowSec(), "v2=forged").body.error).toBe("invalid_signature");
});

it("signs outgoing deliveries with v2, re-signing each retry", async () => {
  const calls: { headers: Record<string, string>; body: string }[] = [];
  const statuses = [503, 200];
  const transport: HttpTransport = {
    post: async (_url, req) => {
      calls.push(req);
      return { status: statuses.shift() ?? 200 };
    },
  };
  const { app, clock, ws, bob, carol, general } = setup({ transport });
  const bot = app.users.create({ handle: "deploy-bot", isBot: true });
  app.workspaces.addMember(bob.id, ws.id, bot.id);
  const sub = app.outgoingWebhooks.subscribe(bob.id, ws.id, { botUserId: bot.id, url: "https://bot.example/e", events: ["message.created"] });
  app.messages.post(carol.id, general.id, "hello");
  clock.advance(1500);
  await app.outgoingWebhooks.flush();
  clock.advance(app.config.webhooks.retryBaseMs);
  await app.outgoingWebhooks.flush();
  expect(calls).toHaveLength(2);
  const ts = calls.map((c) => c.headers["x-steer-timestamp"]);
  expect(ts[0]).toBe(String(Math.floor((clock.now() - app.config.webhooks.retryBaseMs) / 1000)));
  expect(ts[1]).toBe(String(Math.floor(clock.now() / 1000)));
  expect(ts[0]).not.toBe(ts[1]);
  for (const c of calls) expect(c.headers["x-steer-signature"]).toBe(v2(sub.secret, c.headers["x-steer-timestamp"], c.body));
});
