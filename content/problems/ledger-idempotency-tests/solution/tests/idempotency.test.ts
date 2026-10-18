import { describe, it, expect } from "testkit";
import { HOUR_MS } from "../src/lib/time";
import { setup } from "./helpers";

describe("IdempotencyService contract", () => {
  it("replays the stored result without re-running fn", () => {
    const { services } = setup();
    let calls = 0;
    expect(services.idempotency.run("t", "k", { a: 1 }, () => ++calls)).toEqual({ value: 1, replayed: false });
    expect(services.idempotency.run("t", "k", { a: 1 }, () => ++calls)).toEqual({ value: 1, replayed: true });
    expect(calls).toBe(1);
  });

  it("treats payloads with different key order as the same request", () => {
    const { services } = setup();
    services.idempotency.run("t", "k", { a: 1, b: { c: 2, d: 3 } }, () => "x");
    expect(services.idempotency.run("t", "k", { b: { d: 3, c: 2 }, a: 1 }, () => "y")).toEqual({ value: "x", replayed: true });
  });

  it("rejects a different payload under the same key", () => {
    const { services } = setup();
    services.idempotency.run("t", "k", { a: 1 }, () => 1);
    expect(() => services.idempotency.run("t", "k", { a: 2 }, () => 2)).toThrow("different request");
  });

  it("scopes keys", () => {
    const { services } = setup();
    services.idempotency.run("t1", "k", { a: 1 }, () => 1);
    expect(services.idempotency.run("t2", "k", { a: 2 }, () => 2)).toEqual({ value: 2, replayed: false });
  });

  it("reports in-progress for a re-entrant duplicate", () => {
    const { services } = setup();
    expect(() =>
      services.idempotency.run("t", "k", {}, () => services.idempotency.run("t", "k", {}, () => 1)),
    ).toThrow("still in progress");
  });

  it("releases the key when fn throws so the client can retry", () => {
    const { services } = setup();
    expect(() => services.idempotency.run("t", "k", {}, () => { throw new Error("boom"); })).toThrow("boom");
    expect(services.idempotency.run("t", "k", {}, () => 7)).toEqual({ value: 7, replayed: false });
  });

  it("forgets keys after the TTL", () => {
    const { services, clock } = setup();
    services.idempotency.run("t", "k", { a: 1 }, () => 1);
    clock.advance(24 * HOUR_MS);
    expect(services.idempotency.run("t", "k", { a: 2 }, () => 2)).toEqual({ value: 2, replayed: false });
  });
});
