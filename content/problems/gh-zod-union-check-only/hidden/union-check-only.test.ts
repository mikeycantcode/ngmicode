import { expect, test } from "vitest";
import * as z from "../../src/v4";

test("surface an option a check stopped when none can continue", () => {
  // the size cap aborts before parsing elements
  const schema = z.union([z.array(z.string()).max(2), z.string()]);
  expect(schema.safeParse(["a", "b", "c"]).error!.issues).toMatchObject([
    { code: "too_big", origin: "array", path: [] },
  ]);
  expect(z.union([z.int(), z.number().max(5)]).safeParse(7.5).error!.issues).toMatchObject([{ code: "too_big" }]);
  const both = z.union([z.array(z.string()).max(2), z.array(z.number()).max(1)]);
  expect(both.safeParse(["a", "b", "c"]).error!.issues).toMatchObject([{ code: "invalid_union" }]);
});
