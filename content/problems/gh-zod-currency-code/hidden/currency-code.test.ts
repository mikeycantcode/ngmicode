import { beforeAll, expect, test } from "vitest";
import * as z from "../../src/v4";
import * as zm from "../../src/mini";

// English messages, freshly bound to this run's locale module.
beforeAll(() => {
  z.config(z.locales.en());
});

const FAIL = { success: false };

test("currency code", () => {
  const currency = z.currencyCode();
  for (const code of ["USD", "EUR", "XXX", "XCG", "XAD"]) expect(currency.parse(code)).toBe(code);
  for (const input of ["", "usd", "US", "USDX", " USD", "ANG", "BGN"])
    expect(currency.safeParse(input).success).toBe(false);
  expect(currency.safeParse("usd").error!.issues[0]).toMatchObject({
    code: "invalid_format",
    format: "currency_code",
    message: "Invalid currency code",
  });
});

test("currency code toJSONSchema", () => {
  expect(z.toJSONSchema(z.currencyCode())).toEqual({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "string",
    format: "currency_code",
    pattern: z.regexes.currencyCode.source,
  });
});

test("z.currencyCode (mini)", () => {
  const a = zm.currencyCode();
  expect(zm.parse(a, "EUR")).toBe("EUR");
  expect(zm.safeParse(a, "eur")).toMatchObject(FAIL);
});
