import { beforeAll, expect, test } from "vitest";
import * as z from "../../src/v4";

// English messages, freshly bound to this run's locale module.
beforeAll(() => {
  z.config(z.locales.en());
});

test("z.xor() - multiple matches fails", () => {
  const schema = z.xor([z.string(), z.any()]);
  const result = schema.safeParse("hello");
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues).toEqual([
      {
        code: "invalid_union",
        errors: [],
        inclusive: false,
        matches: [0, 1],
        message: "Invalid input: more than one option matched",
        path: [],
      },
    ]);
  }
});

test("z.xor() - multiple matches reports every matching option", () => {
  // non-strict objects strip unknown keys, so both branches accept the extra key
  const name = z.object({ name: z.string() });
  const version = name.extend({ version: z.string() });
  const result = z.xor([name, version, z.unknown()]).safeParse({ name: "windows", version: "10" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const issue = result.error.issues[0] as z.core.$ZodIssueInvalidUnion;
    expect(issue.inclusive).toBe(false);
    expect((issue as Extract<typeof issue, { inclusive: false }>).matches).toEqual([0, 1, 2]);
    expect(issue.message).toBe("Invalid input: more than one option matched");
  }
});

test("z.xor() - zero matches keeps the per-option errors", () => {
  const result = z.xor([z.string(), z.number()]).safeParse(true);
  expect(result.success).toBe(false);
  if (!result.success) {
    const issue = result.error.issues[0] as z.core.$ZodIssueInvalidUnion;
    expect(issue.errors).toHaveLength(2);
    expect(issue.message).toBe("Invalid input");
  }
});
