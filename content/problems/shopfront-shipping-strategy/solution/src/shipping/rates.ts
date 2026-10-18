import { ConflictError, ValidationError } from "../shared/errors";

/** Built-ins are "standard" | "express" | "overnight"; more can be registered. */
export type ShippingMethod = string;

export interface ShippingInput {
  method: ShippingMethod;
  region: string;
  /** Total parcel weight. */
  weightGrams: number;
  /** Goods value after all discounts — used for the free-shipping threshold. */
  goodsNetCents: number;
}

export interface ShippingCalculator {
  method: ShippingMethod;
  /** Region is already known to be a US-* or EU-* region. */
  isAvailable(region: string): boolean;
  /** `kg` is billable weight: whole kilograms rounded up, minimum 1. */
  price(input: ShippingInput & { kg: number }): number;
}

const REMOTE_SURCHARGE = 1000; // AK / HI
const isUS = (region: string) => region.startsWith("US-");
const isRemote = (region: string) => region === "US-AK" || region === "US-HI";

// Billable weight is whole kilograms, rounded UP, minimum 1 kg.
function billableKg(weightGrams: number): number {
  return Math.max(1, Math.ceil(weightGrams / 1000));
}

interface ZoneRate {
  base: number;
  perExtraKg: number;
  /** goods net at or above which the base rate is waived; null = never free */
  freeFrom: number | null;
}

/** Zone-priced method: US/EU rates, optional free threshold, AK/HI surcharge always applies. */
function zoned(method: string, us: ZoneRate, eu: ZoneRate): ShippingCalculator {
  return {
    method,
    isAvailable: () => true,
    price({ region, kg, goodsNetCents }) {
      const rate = isUS(region) ? us : eu;
      const free = rate.freeFrom !== null && goodsNetCents >= rate.freeFrom;
      const price = free ? 0 : rate.base + (kg - 1) * rate.perExtraKg;
      return isRemote(region) ? price + REMOTE_SURCHARGE : price;
    },
  };
}

const registry = new Map<ShippingMethod, ShippingCalculator>();

export function registerShippingMethod(calc: ShippingCalculator): void {
  if (registry.has(calc.method)) throw new ConflictError(`shipping method ${calc.method} is already registered`);
  registry.set(calc.method, calc);
}

registerShippingMethod(zoned("standard", { base: 499, perExtraKg: 100, freeFrom: 5000 }, { base: 899, perExtraKg: 150, freeFrom: 10000 }));
registerShippingMethod(zoned("express", { base: 1299, perExtraKg: 200, freeFrom: null }, { base: 1999, perExtraKg: 300, freeFrom: null }));
registerShippingMethod({
  method: "overnight",
  isAvailable: (region) => isUS(region) && !isRemote(region),
  // first 2 kg included
  price: ({ kg }) => 2999 + Math.max(0, kg - 2) * 500,
});

/** Methods available in `region`, in registration order (built-ins first). */
export function listShippingMethods(region: string): ShippingMethod[] {
  if (!isUS(region) && !region.startsWith("EU-")) return [];
  return [...registry.values()].filter((c) => c.isAvailable(region)).map((c) => c.method);
}

export function isShippingMethod(value: unknown): value is ShippingMethod {
  return typeof value === "string" && registry.has(value);
}

/** Shipping price in cents. */
export function quoteShipping(input: ShippingInput): number {
  const { method, region, weightGrams } = input;
  if (!Number.isInteger(weightGrams) || weightGrams < 0) throw new ValidationError("weightGrams must be a non-negative integer");
  if (!isUS(region) && !region.startsWith("EU-")) throw new ValidationError(`we do not ship to ${region}`);
  const calc = registry.get(method);
  if (!calc) throw new ValidationError(`unknown shipping method ${String(method)}`);
  if (!calc.isAvailable(region)) throw new ValidationError(`${method} shipping is not available in ${region}`);
  return calc.price({ ...input, kg: billableKg(weightGrams) });
}
