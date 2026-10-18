import { expect, it } from "testkit";
import { lngDelta, normalizeLng } from "../../src/geo/latlng";

it("normalizeLng maps into the half-open range [-180, 180)", () => {
  expect(normalizeLng(0)).toBe(0);
  expect(normalizeLng(45.5)).toBe(45.5);
  expect(normalizeLng(190)).toBe(-170);
  expect(normalizeLng(-190)).toBe(170);
  expect(normalizeLng(180)).toBe(-180);
  expect(normalizeLng(-180)).toBe(-180);
  expect(normalizeLng(540)).toBe(-180);
  expect(normalizeLng(359.5)).toBe(-0.5);
  expect(normalizeLng(-725)).toBe(-5);
});

it("normalizeLng never returns -0 and rejects non-finite input", () => {
  expect(normalizeLng(360)).toBe(0);
  expect(normalizeLng(-360)).toBe(0);
  expect(normalizeLng(-0)).toBe(0);
  expect(() => normalizeLng(NaN)).toThrow(RangeError);
  expect(() => normalizeLng(Infinity)).toThrow("invalid longitude: Infinity");
});

it("lngDelta is the signed shortest eastward delta", () => {
  expect(lngDelta(179, -179)).toBe(2);
  expect(lngDelta(-179, 179)).toBe(-2);
  expect(lngDelta(10, 30)).toBe(20);
  expect(lngDelta(30, 10)).toBe(-20);
  expect(lngDelta(0, 180)).toBe(-180);
  expect(lngDelta(-90, 90)).toBe(-180);
  expect(lngDelta(10, 10)).toBe(0);
  expect(lngDelta(-170, -170)).toBe(0);
  expect(() => lngDelta(0, NaN)).toThrow("invalid longitude: NaN");
});
