import { it, expect } from "testkit";
import { setup, TENANT } from "../helpers";

const JAN_20 = Date.UTC(2024, 0, 20);
const JAN_31 = Date.UTC(2024, 0, 31, 23, 59, 59);
const FEB_10 = Date.UTC(2024, 1, 10);

it("reversing today does not change balances or the trial balance as of the past", () => {
  const { services, clock, wallet, fund, balance } = setup();
  clock.set(Date.UTC(2024, 0, 5));
  fund(wallet.id, 4000);
  clock.set(JAN_20);
  const dup = fund(wallet.id, 1500);
  const janBefore = services.reports.trialBalance(TENANT, { asOf: JAN_31 });
  expect(balance(wallet.id, JAN_31)).toBe(5500);

  clock.set(FEB_10);
  const rev = services.journal.reverse(dup.id, "duplicate top-up");
  expect(rev.postedAt).toBe(FEB_10);
  expect(balance(wallet.id, JAN_31)).toBe(5500);
  expect(services.reports.trialBalance(TENANT, { asOf: JAN_31 })).toEqual(janBefore);
  expect(balance(wallet.id)).toBe(4000);
});

it("shows the reversal as its own line in the period it was made", () => {
  const { services, clock, wallet, fund } = setup();
  clock.set(JAN_20);
  const dup = fund(wallet.id, 1500);
  clock.set(FEB_10);
  const rev = services.journal.reverse(dup.id, "duplicate");
  const feb = services.statements.getStatement(wallet.id, { from: Date.UTC(2024, 1, 1), to: Date.UTC(2024, 1, 29) });
  expect(feb.opening.amount).toBe(1500);
  expect(feb.lines.map((l) => [l.entryId, l.change, l.balance])).toEqual([[rev.id, -1500, 0]]);
  expect(() => services.journal.reverse(dup.id, "again")).toThrow("already reversed");
});
