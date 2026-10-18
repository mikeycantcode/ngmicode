import { expect, test } from "vitest";
import { fromJSONSchema } from "../../src/v4/classic/from-json-schema";
import * as z from "../../src/v4/classic/index";
test("minProperties and maxProperties count the raw input", () => {
  const schema = fromJSONSchema({
    type: "object",
    properties: { a: { type: "string" } },
    minProperties: 1,
    maxProperties: 2,
  });
  expect(schema.safeParse({ a: "x" }).success).toBe(true);
  expect(schema.safeParse({}).error!.issues[0]).toMatchObject({ code: "too_small", origin: "object", minimum: 1 });
  expect(schema.safeParse({ a: "x", b: 1, c: 2 }).error!.issues[0]).toMatchObject({
    code: "too_big",
    origin: "object",
    maximum: 2,
  });
  // raw input: a defaulted property does not satisfy the minimum, and a dropped __proto__ still counts
  const defaulted = fromJSONSchema({
    type: "object",
    properties: { a: { type: "string", default: "x" } },
    minProperties: 1,
  });
  expect(defaulted.safeParse({}).success).toBe(false);
  const capped = fromJSONSchema({ type: "object", maxProperties: 1 });
  expect(capped.safeParse(JSON.parse('{"__proto__":1,"a":1}')).success).toBe(false);
  expect(z.toJSONSchema(schema)).toMatchObject({ minProperties: 1, maxProperties: 2 });
});

test("minProperties composes with propertyNames in one guard", () => {
  const schema = fromJSONSchema({ type: "object", propertyNames: { pattern: "^a" }, minProperties: 1 });
  expect(schema.safeParse({}).error!.issues[0]!.code).toBe("too_small");
  expect(schema.safeParse({ b: 1 }).error!.issues[0]!.code).toBe("invalid_key");
  expect(schema.safeParse({ a: 1 }).success).toBe(true);
});

test("uniqueItems rejects structural duplicates", () => {
  const schema = fromJSONSchema({ type: "array", uniqueItems: true });
  expect(
    schema.safeParse([
      { a: 1, b: 2 },
      { b: 2, a: 1 },
    ]).error!.issues[0]
  ).toMatchObject({
    code: "custom",
    path: [1],
  });
  expect(schema.safeParse([1, "1", true, 1]).success).toBe(false);
  expect(schema.safeParse([{ a: 1 }, { a: 2 }, [1], [2]]).success).toBe(true);
  expect(z.toJSONSchema(schema)).toMatchObject({ uniqueItems: true });
});

test("contains with minContains and maxContains", () => {
  const schema = fromJSONSchema({ type: "array", contains: { type: "integer" } });
  expect(schema.safeParse(["a"]).success).toBe(false);
  expect(schema.safeParse(["a", 1]).success).toBe(true);
  const bounded = fromJSONSchema({ type: "array", contains: { type: "integer" }, minContains: 2, maxContains: 3 });
  expect(bounded.safeParse([1, "a"]).success).toBe(false);
  expect(bounded.safeParse([1, 2, "a"]).success).toBe(true);
  expect(bounded.safeParse([1, 2, 3, 4]).success).toBe(false);
  // minContains: 0 accepts an array with no matches at all
  expect(fromJSONSchema({ type: "array", contains: { type: "integer" }, minContains: 0 }).safeParse([]).success).toBe(
    true
  );
  expect(z.toJSONSchema(bounded)).toMatchObject({ contains: { type: "integer" }, minContains: 2, maxContains: 3 });
});

test("uniqueItems and contains see the raw instance, not the parsed output", () => {
  const items = { type: "object", properties: { a: { type: "string", default: "x" } } } as const;
  // no instance item carries `a`; the default must not synthesize the match
  const contains = fromJSONSchema({
    type: "array",
    items,
    contains: { type: "object", properties: { a: { const: "x" } }, required: ["a"] },
  });
  expect(contains.safeParse([{}]).success).toBe(false);
  expect(contains.safeParse([{ a: "x" }]).success).toBe(true);
  // the instance items differ; the default must not collapse them into duplicates
  const unique = fromJSONSchema({ type: "array", items, uniqueItems: true });
  expect(unique.safeParse([{ a: "x" }, {}]).success).toBe(true);
  expect(unique.safeParse([{}, {}]).error!.issues[0]).toMatchObject({ code: "custom", path: [1] });
});

