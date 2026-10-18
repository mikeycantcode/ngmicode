import { it, expect } from "testkit";
import { InvalidTransitionError } from "../../src/domain/errors";
import { allowedEvents, transition } from "../../src/domain/paymentStateMachine";
import { DAY_MS } from "../../src/lib/time";
import { setup, TENANT } from "../helpers";

it("encodes the transition table with the documented messages", () => {
  expect(transition("authorized", "capture")).toBe("captured");
  expect(transition("authorized", "expire")).toBe("expired");
  expect(transition("captured", "refund")).toBe("partially_refunded");
  expect(transition("partially_refunded", "refund_full")).toBe("refunded");
  expect(allowedEvents("authorized")).toEqual(["capture", "void", "expire"]);
  expect(allowedEvents("partially_refunded")).toEqual(["refund", "refund_full"]);
  expect(allowedEvents("voided")).toEqual([]);
  expect(() => transition("voided", "void")).toThrow(InvalidTransitionError);
  expect(() => transition("captured", "void")).toThrow("cannot void payment in status captured");
  expect(() => transition("refunded", "refund_full")).toThrow("cannot refund payment in status refunded");
});

it("still lazily expires an authorization captured after its TTL", () => {
  const { services, clock, wallet, merchant, fund, balance } = setup();
  fund(wallet.id, 3000);
  const p = services.payments.authorize({ tenantId: TENANT, customerAccountId: wallet.id, merchantAccountId: merchant.id, amount: 3000, currency: "USD" });
  clock.advance(7 * DAY_MS + 1);
  expect(() => services.payments.capture(p.id)).toThrow("cannot capture payment in status expired");
  expect(services.payments.get(p.id).status).toBe("expired");
  expect(balance(wallet.id)).toBe(3000);
  expect(balance(merchant.id)).toBe(0);
  expect(services.audit.query({ type: "payment.expired" })).toHaveLength(1);
  expect(() => services.payments.void(p.id)).toThrow("cannot void payment in status expired");
  expect(() => services.payments.refund(p.id, 1)).toThrow("cannot refund payment in status expired");
});
