import { describe, it, expect } from "testkit";
import { setup } from "./helpers";

describe("idempotency service", () => {
  it("returns the stored result for a repeated key", () => {
    const { services } = setup();
    let calls = 0;
    const a = services.idempotency.run("t", "k1", { x: 1 }, () => ++calls);
    const b = services.idempotency.run("t", "k1", { x: 1 }, () => ++calls);
    expect(a).toEqual({ value: 1, replayed: false });
    expect(b).toEqual({ value: 1, replayed: true });
    expect(calls).toBe(1);
  });

  it("rejects a reused key with a different request", () => {
    const { services } = setup();
    services.idempotency.run("t", "k1", { x: 1 }, () => 1);
    expect(() => services.idempotency.run("t", "k1", { x: 2 }, () => 2)).toThrow("different request");
  });
});
