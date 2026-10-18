import { expect, test } from "vitest";
import * as z from "../../src/v4";

test("datetime parsing with local and offset", () => {
  const a = z.string().datetime({ local: true, offset: true });

  a.parse("2022-10-13T12:52:00");
  a.parse("2022-10-13T12:52:00Z");
  a.parse("2022-10-13T12:52:00+02:00");
  // `local` only makes the suffix optional; the unqualified form may still omit seconds
  a.parse("2022-10-13T12:52");
  expect(() => a.parse("2022-10-13T12:52:00+02")).toThrow();
  // a `Z` or an offset makes it RFC 3339, which mandates seconds
  expect(() => a.parse("2022-10-13T12:52Z")).toThrow();
  expect(() => a.parse("2022-10-13T12:52+02:00")).toThrow();
});

test("datetime requires seconds once a Z or offset is present", () => {
  expect(z.iso.datetime().safeParse("2022-10-13T12:52Z").success).toEqual(false);
  expect(z.iso.datetime().safeParse("2022-10-13T12:52:00Z").success).toEqual(true);
  expect(z.iso.datetime().safeParse("2022-10-13T12:52:00.123Z").success).toEqual(true);
  expect(z.iso.datetime({ offset: true }).safeParse("2022-10-13T12:52+02:00").success).toEqual(false);
  expect(z.iso.datetime({ offset: true }).safeParse("2022-10-13T12:52:00+02:00").success).toEqual(true);
  // an explicit precision still wins, and gives up `format: "date-time"` in exchange
  expect(z.iso.datetime({ precision: -1 }).safeParse("2022-10-13T12:52Z").success).toEqual(true);
  expect(z.toJSONSchema(z.iso.datetime()).format).toEqual("date-time");
  expect(z.toJSONSchema(z.iso.datetime({ precision: -1 })).format).toEqual(undefined);
});

test("the documented migration union reproduces the old default", () => {
  // no single precision covers both, so the docs point at this union — pin that it works
  const mixed = z.union([z.iso.datetime(), z.iso.datetime({ precision: -1 })]);
  expect(mixed.safeParse("2020-01-01T06:15Z").success).toEqual(true);
  expect(mixed.safeParse("2020-01-01T06:15:00Z").success).toEqual(true);
  expect(mixed.safeParse("2020-01-01T06:15:00.123Z").success).toEqual(true);
  expect(mixed.safeParse("2020-01-01T06:15").success).toEqual(false);
});
