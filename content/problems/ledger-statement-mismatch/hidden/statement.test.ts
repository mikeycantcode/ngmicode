import { it, expect } from "testkit";
import { credit, debit } from "../../src/domain/journal";
import { money } from "../../src/domain/money";
import { DAY_MS } from "../../src/lib/time";
import { setup, TENANT } from "../helpers";

const MAR_1 = Date.UTC(2024, 2, 1);
const MAR_31 = Date.UTC(2024, 2, 31, 23, 59, 59, 999);

it("closing matches the balance endpoint and lines run on the normal side", () => {
  const { services, clock, wallet, merchant, fund, balance } = setup();
  clock.set(Date.UTC(2024, 1, 15));
  fund(wallet.id, 1000);
  clock.set(MAR_1 + DAY_MS);
  fund(wallet.id, 3000);
  clock.advance(DAY_MS);
  const p = services.payments.authorize({ tenantId: TENANT, customerAccountId: wallet.id, merchantAccountId: merchant.id, amount: 2500, currency: "USD" });
  services.payments.capture(p.id);
  const s = services.statements.getStatement(wallet.id, { from: MAR_1, to: MAR_31 });
  expect(s.opening.amount).toBe(1000);
  expect(s.lines.map((l) => l.change)).toEqual([3000, -2500]);
  expect(s.lines.map((l) => l.balance)).toEqual([4000, 1500]);
  expect(s.closing.amount).toBe(balance(wallet.id, MAR_31));

  const m = services.statements.getStatement(merchant.id, { from: MAR_1, to: MAR_31 });
  expect(m.closing.amount).toBe(balance(merchant.id, MAR_31));
  expect(m.closing.amount).toBe(2500 - 62); // fee 62.5 rounds half-even to 62
});

it("counts an entry exactly at `from` once, as a line", () => {
  const { services, clock, wallet, cash, fund, balance } = setup();
  clock.set(MAR_1 - 1);
  fund(wallet.id, 200);
  clock.set(MAR_1);
  const atMidnight = fund(wallet.id, 700);
  clock.set(MAR_31);
  services.journal.post({
    tenantId: TENANT,
    description: "Withdrawal",
    postings: [debit(wallet.id, money(100, "USD")), credit(cash.id, money(100, "USD"))],
  });
  const s = services.statements.getStatement(wallet.id, { from: MAR_1, to: MAR_31 });
  expect(s.opening.amount).toBe(200);
  expect(s.lines[0]).toMatchObject({ entryId: atMidnight.id, change: 700, balance: 900 });
  expect(s.closing.amount).toBe(800);
  expect(s.closing.amount).toBe(balance(wallet.id, MAR_31));
  const c = services.statements.getStatement(cash.id, { from: MAR_1, to: MAR_31 });
  expect([c.opening.amount, c.closing.amount]).toEqual([200, 800]);
});
