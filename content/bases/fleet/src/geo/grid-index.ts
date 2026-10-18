import { haversineKm, KM_PER_DEG_LAT } from "./haversine";
import { type LatLng, toRadians } from "./latlng";

export interface IndexHit {
  id: string;
  distanceKm: number;
}

/**
 * Uniform lat/lng grid spatial index. Each id lives in exactly one cell.
 * Longitude cells wrap around the antimeridian; near the poles a radius
 * query degrades to scanning whole latitude rows (fine — we have no riders there).
 */
export class GridIndex {
  private readonly cells = new Map<string, Set<string>>();
  private readonly entries = new Map<string, { pos: LatLng; key: string }>();
  private readonly lngCells: number;
  private readonly latCells: number;

  constructor(private readonly cellDeg = 0.02) {
    if (!(cellDeg > 0 && cellDeg <= 10)) throw new RangeError("cellDeg must be in (0, 10]");
    this.lngCells = Math.round(360 / cellDeg);
    this.latCells = Math.round(180 / cellDeg);
  }

  get size(): number {
    return this.entries.size;
  }

  private latIdx(lat: number): number {
    return Math.min(this.latCells - 1, Math.max(0, Math.floor((lat + 90) / this.cellDeg)));
  }

  private lngIdx(lng: number): number {
    const i = Math.floor((lng + 180) / this.cellDeg);
    return ((i % this.lngCells) + this.lngCells) % this.lngCells;
  }

  private key(latI: number, lngI: number): string {
    return `${latI}:${lngI}`;
  }

  upsert(id: string, pos: LatLng): void {
    const key = this.key(this.latIdx(pos.lat), this.lngIdx(pos.lng));
    const prev = this.entries.get(id);
    if (prev && prev.key !== key) this.cells.get(prev.key)?.delete(id);
    if (!prev || prev.key !== key) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = new Set();
        this.cells.set(key, cell);
      }
      cell.add(id);
    }
    this.entries.set(id, { pos: { lat: pos.lat, lng: pos.lng }, key });
  }

  remove(id: string): boolean {
    const prev = this.entries.get(id);
    if (!prev) return false;
    const cell = this.cells.get(prev.key);
    cell?.delete(id);
    if (cell && cell.size === 0) this.cells.delete(prev.key);
    this.entries.delete(id);
    return true;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  position(id: string): LatLng | undefined {
    return this.entries.get(id)?.pos;
  }

  /**
   * All ids within `radiusKm` of `center` (great-circle), nearest first,
   * ties broken by id. `accept` filters ids before the distance check.
   */
  queryRadius(center: LatLng, radiusKm: number, accept?: (id: string) => boolean): IndexHit[] {
    const dLat = radiusKm / KM_PER_DEG_LAT;
    const latLo = Math.max(-90, center.lat - dLat);
    const latHi = Math.min(90, center.lat + dLat);
    const maxAbsLat = Math.max(Math.abs(latLo), Math.abs(latHi));
    const cosLat = Math.cos(toRadians(maxAbsLat));
    const dLng = cosLat < 1e-6 ? 360 : radiusKm / (KM_PER_DEG_LAT * cosLat);

    const latStart = this.latIdx(latLo);
    const latEnd = this.latIdx(latHi);
    let lngStart: number;
    let lngCount: number;
    if (dLng >= 180) {
      lngStart = 0;
      lngCount = this.lngCells;
    } else {
      const lo = Math.floor((center.lng - dLng + 180) / this.cellDeg);
      const hi = Math.floor((center.lng + dLng + 180) / this.cellDeg);
      lngStart = lo;
      lngCount = Math.min(this.lngCells, hi - lo + 1);
    }

    const hits: IndexHit[] = [];
    for (let la = latStart; la <= latEnd; la++) {
      for (let k = 0; k < lngCount; k++) {
        const ln = (((lngStart + k) % this.lngCells) + this.lngCells) % this.lngCells;
        const cell = this.cells.get(this.key(la, ln));
        if (!cell) continue;
        for (const id of cell) {
          if (accept && !accept(id)) continue;
          const pos = this.entries.get(id)!.pos;
          const d = haversineKm(center, pos);
          if (d <= radiusKm) hits.push({ id, distanceKm: d });
        }
      }
    }
    hits.sort((a, b) => a.distanceKm - b.distanceKm || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return hits;
  }
}
