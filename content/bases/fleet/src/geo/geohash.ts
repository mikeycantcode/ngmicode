import type { LatLng } from "./latlng";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const DECODE_MAP: Record<string, number> = Object.fromEntries([...BASE32].map((c, i) => [c, i]));

export interface GeohashBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Standard geohash encoding (interleaved lng/lat bits, base32). */
export function encodeGeohash(p: LatLng, precision = 7): string {
  if (precision < 1 || precision > 12) throw new RangeError("geohash precision must be 1..12");
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (minLng + maxLng) / 2;
      if (p.lng >= mid) {
        ch = (ch << 1) | 1;
        minLng = mid;
      } else {
        ch = ch << 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (p.lat >= mid) {
        ch = (ch << 1) | 1;
        minLat = mid;
      } else {
        ch = ch << 1;
        maxLat = mid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export function geohashBounds(hash: string): GeohashBounds {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let evenBit = true;
  for (const c of hash.toLowerCase()) {
    const idx = DECODE_MAP[c];
    if (idx === undefined) throw new RangeError(`invalid geohash character '${c}'`);
    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1;
      if (evenBit) {
        const mid = (minLng + maxLng) / 2;
        if (bitN === 1) minLng = mid;
        else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (bitN === 1) minLat = mid;
        else maxLat = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Center of the geohash cell. */
export function decodeGeohash(hash: string): LatLng {
  const b = geohashBounds(hash);
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}
