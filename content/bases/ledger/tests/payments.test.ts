import { describe, it, expect } from "testkit";
import { InvalidTransitionError } from "../src/domain/errors";
import { setup, TENANT } from "./helpers";

function holdsBalance(services: ReturnType<typeof setup>["services"]) {
  const holds = services.repos.accounts.findSystemAccount(TENANT, "holds", "USD");
  return holds ? services.balances.getBalance(holds.id).amount : 0;
}

describe("payments", () => {
  it("authorize places a hold on the wallet", () => {
    const { services, wallet, merchant, fund, balance } = setup();
    fund(wallet.id, 10000);
    const p = services.payments.authorize({
      tenantId: TENANT,
      customerAccountId: wallet.id,
      merchantAccountId: merchant.id,
      amount: 4000,
      currency: "USD",
    });
    expect(p.status).toBe("authorized");
    expect(balance(wallet.id)).toBe(6000);
    expect(holdsBalance(services)).toBe(4000);
  });

  it("capture pays the merchant net of the fee", () => {
    const { services, wallet, merchant, fund, balance } = setup();
    fund(wallet.id, 10000);
    const p = services.payments.authorize({
      tenantId: TENANT,
      customerAccountId: wallet.id,
      merchantAccountId: merchant.id,
      amount: 10000,
      currency: "USD",
    });
    const c = services.payments.capture(p.id);
    expect(c).toMatchObject({ status: "captured", capturedAmount: 10000, feeAmount: 250 });
    expect(balance(merchant.id)).toBe(9750);
    expect(holdsBalance(services)).toBe(0);
    const fees = services.repos.accounts.findSystemAccount(TENANT, "fees", "USD")!;
    expect(balance(fees.id)).toBe(250);
  });

  it("void releases the hold and cannot be captured afterwards", () => {
    const { services, wallet, merchant, fund, balance } = setup();
    fund(wallet.id, 5000);
    const p = services.payments.authorize({
      tenantId: TENANT,
      customerAccountId: wallet.id,
      merchantAccountId: merchant.id,
      amount: 5000,
      currency: "USD",
    });
    services.payments.void(p.id);
    expect(balance(wallet.id)).toBe(5000);
    expect(() => services.payments.capture(p.id)).toThrow(InvalidTransitionError);
  });

  it("supports partial then full refunds", () => {
    const { services, wallet, merchant, fund, balance } = setup();
    fund(wallet.id, 10000);
    const p = services.payments.authorize({
      tenantId: TENANT,
      customerAccountId: wallet.id,
      merchantAccountId: merchant.id,
      amount: 10000,
      currency: "USD",
    });
    services.payments.capture(p.id);
    expect(services.payments.refund(p.id, 4000).status).toBe("partially_refunded");
    expect(services.payments.refund(p.id, 6000).status).toBe("refunded");
    expect(balance(wallet.id)).toBe(10000);
    expect(balance(merchant.id)).toBe(-250);
  });

  it("rejects authorizations beyond the wallet balance", () => {
    const { services, wallet, merchant, fund } = setup();
    fund(wallet.id, 100);
    expect(() =>
      services.payments.authorize({
        tenantId: TENANT,
        customerAccountId: wallet.id,
        merchantAccountId: merchant.id,
        amount: 101,
        currency: "USD",
      }),
    ).toThrow("insufficient funds");
  });
});
