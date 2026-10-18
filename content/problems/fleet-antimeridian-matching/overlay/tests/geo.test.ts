import { describe, expect, it } from "testkit";
import { decodeGeohash, encodeGeohash } from "../src/geo/geohash";
import { GridIndex } from "../src/geo/grid-index";
import { equirectangularKm, haversineKm, initialBearingDeg } from "../src/geo/haversine";
import { areaContains, assertLatLng, isValidLatLng, LAUNCH_AREAS } from "../src/geo/latlng";
import { ValidationError } from "../src/shared/errors";
import { offset, SF } from "./fixtures";

describe("haversine", () => {
  it("SF to LA is ~559km", () => {
    expect(haversineKm(SF, { lat: 34.0522, lng: -118.2437 })).toBeCloseTo(559.1, 0);
  });

  it("is short across the antimeridian", () => {
    const d = haversineKm({ lat: -16.8, lng: 179.99 }, { lat: -16.8, lng: -179.99 });
    expect(d).toBeLessThan(2.2);
    expect(equirectangularKm({ lat: -16.8, lng: 179.99 }, { lat: -16.8, lng: -179.99 })).toBeCloseTo(d, 2);
  });

  it("bearing east is 90", () => {
    expect(initialBearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 5);
  });
});

describe("latlng", () => {
  it("validates ranges and types", () => {
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: NaN, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: "1", lng: 0 })).toBe(false);
    expect(() => assertLatLng({ lat: 0, lng: 200 })).toThrow(ValidationError);
  });
});

describe("geohash", () => {
  it("encodes a known point", () => {
    expect(encodeGeohash({ lat: 57.64911, lng: 10.40744 }, 11)).toBe("u4pruydqqvj");
  });
  it("decodes to the cell center", () => {
    const c = decodeGeohash(encodeGeohash(SF, 7));
    expect(haversineKm(c, SF)).toBeLessThan(0.1);
  });
});

describe("GridIndex", () => {
  it("returns hits within radius sorted by distance", () => {
    const idx = new GridIndex(0.02);
    idx.upsert("far", offset(SF, 4));
    idx.upsert("near", offset(SF, 1));
    idx.upsert("out", offset(SF, 9));
    expect(idx.queryRadius(SF, 5).map((h) => h.id)).toEqual(["near", "far"]);
  });

  it("moves ids between cells on upsert and supports remove", () => {
    const idx = new GridIndex(0.02);
    idx.upsert("a", offset(SF, 20));
    expect(idx.queryRadius(SF, 2)).toHaveLength(0);
    idx.upsert("a", offset(SF, 0.5));
    expect(idx.queryRadius(SF, 2).map((h) => h.id)).toEqual(["a"]);
    expect(idx.queryRadius(offset(SF, 20), 2)).toHaveLength(0);
    idx.remove("a");
    expect(idx.size).toBe(0);
  });

  it("applies the accept filter", () => {
    const idx = new GridIndex();
    idx.upsert("a", SF);
    idx.upsert("b", SF);
    expect(idx.queryRadius(SF, 1, (id) => id !== "a").map((h) => h.id)).toEqual(["b"]);
  });
});

describe("service areas", () => {
  it("handles areas that cross the antimeridian", () => {
    const fiji = LAUNCH_AREAS.find((a) => a.id === "suv")!;
    expect(areaContains(fiji, { lat: -16.8, lng: -179.9 })).toBe(true);
    expect(areaContains(fiji, { lat: -17.7, lng: 178.4 })).toBe(true);
    expect(areaContains(fiji, { lat: -17.7, lng: 170 })).toBe(false);
  });
});
