import { it, expect } from "testkit";
import { setup } from "../helpers";

type Page = { data: { id: string }[]; nextCursor: string | null };

function pageAll(call: ReturnType<typeof setup>["call"], accountId: string, limit: number, between?: () => void): string[] {
  const ids: string[] = [];
  let cursor: string | null = null;
  let first = true;
  for (let i = 0; i < 100; i++) {
    const q = `limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = call("GET", `/accounts/${accountId}/entries?${q}`);
    expect(res.status).toBe(200);
    const page = res.body as Page;
    ids.push(...page.data.map((e) => e.id));
    if (first && between) between();
    first = false;
    if (page.nextCursor === null) return ids;
    cursor = page.nextCursor;
  }
  throw new Error("pagination did not terminate");
}

it("pages through entries sharing timestamps exactly once, in order", () => {
  const { call, clock, wallet, fund, services } = setup();
  for (let i = 0; i < 3; i++) fund(wallet.id, 10 + i);
  clock.advance(1000);
  for (let i = 0; i < 4; i++) fund(wallet.id, 20 + i);
  const expected = services.repos.journal.listForAccount(wallet.id).map((e) => e.id);
  expect(pageAll(call, wallet.id, 2)).toEqual(expected);
  expect(pageAll(call, wallet.id, 7)).toEqual(expected);
  const def = call("GET", `/accounts/${wallet.id}/entries`).body as Page;
  expect(def.data).toHaveLength(7);
  expect(def.nextCursor).toBeNull();
});

it("does not repeat or skip entries when back-dated entries arrive mid-scroll", () => {
  const { call, clock, wallet, fund } = setup();
  const t0 = clock.now();
  const originals: string[] = [];
  for (let i = 1; i <= 5; i++) {
    clock.set(t0 + i * 1000);
    originals.push(fund(wallet.id, i).id);
  }
  const seen = pageAll(call, wallet.id, 2, () => {
    fund(wallet.id, 99, t0 + 500); // back-dated before everything
  });
  expect(seen).toEqual(originals);
});

it("defaults to 50, caps at 200 and validates input", () => {
  const { call, wallet, fund } = setup();
  for (let i = 0; i < 55; i++) fund(wallet.id, 1);
  const first = call("GET", `/accounts/${wallet.id}/entries`).body as Page;
  expect(first.data).toHaveLength(50);
  expect(typeof first.nextCursor).toBe("string");
  expect(call("GET", `/accounts/${wallet.id}/entries?limit=200`).status).toBe(200);
  for (const bad of ["0", "201", "abc", "2.5", "-1"]) {
    expect(call("GET", `/accounts/${wallet.id}/entries?limit=${bad}`).status).toBe(400);
  }
  expect(call("GET", `/accounts/${wallet.id}/entries?cursor=not-a-cursor`).status).toBe(400);
});
