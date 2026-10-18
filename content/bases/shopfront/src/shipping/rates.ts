import { ValidationError } from "../shared/errors";

export type ShippingMethod = "standard" | "express" | "overnight";

export const SHIPPING_METHODS: ShippingMethod[] = ["standard", "express", "overnight"];

export interface ShippingInput {
  method: ShippingMethod;
  region: string;
  /** Total parcel weight. */
  weightGrams: number;
  /** Goods value after all discounts — used for the free-shipping threshold. */
  goodsNetCents: number;
}

const US_FREE_STANDARD_THRESHOLD = 5000;
const EU_FREE_STANDARD_THRESHOLD = 10000;
const REMOTE_SURCHARGE = 1000; // AK / HI

// Billable weight is whole kilograms, rounded UP, minimum 1 kg.
function billableKg(weightGrams: number): number {
  return Math.max(1, Math.ceil(weightGrams / 1000));
}

/**
 * Shipping price in cents.
 *
 * This grew one carrier contract at a time; it is due a cleanup (see README
 * "Known debt"). Behavior here is what customers are charged today — keep it.
 */
export function quoteShipping(input: ShippingInput): number {
  const { method, region, weightGrams, goodsNetCents } = input;
  if (!Number.isInteger(weightGrams) || weightGrams < 0) throw new ValidationError("weightGrams must be a non-negative integer");
  const kg = billableKg(weightGrams);
  const isUS = region.startsWith("US-");
  const isEU = region.startsWith("EU-");
  if (!isUS && !isEU) throw new ValidationError(`we do not ship to ${region}`);

  let price: number;
  switch (method) {
    case "standard":
      if (isUS) {
        if (goodsNetCents >= US_FREE_STANDARD_THRESHOLD) {
          price = 0;
        } else {
          price = 499 + (kg - 1) * 100;
        }
        if (region === "US-AK" || region === "US-HI") {
          price += REMOTE_SURCHARGE;
        }
      } else {
        if (goodsNetCents >= EU_FREE_STANDARD_THRESHOLD) {
          price = 0;
        } else {
          price = 899 + (kg - 1) * 150;
        }
      }
      break;
    case "express":
      // express is never free, even above the threshold
      if (isUS) {
        price = 1299 + (kg - 1) * 200;
        if (region === "US-AK" || region === "US-HI") {
          price += REMOTE_SURCHARGE;
        }
      } else {
        price = 1999 + (kg - 1) * 300;
      }
      break;
    case "overnight":
      if (!isUS) throw new ValidationError(`overnight shipping is not available in ${region}`);
      if (region === "US-AK" || region === "US-HI") {
        throw new ValidationError(`overnight shipping is not available in ${region}`);
      }
      // first 2 kg included
      price = 2999 + Math.max(0, kg - 2) * 500;
      break;
    default:
      throw new ValidationError(`unknown shipping method ${String(method)}`);
  }
  return price;
}

export function isShippingMethod(value: unknown): value is ShippingMethod {
  return typeof value === "string" && (SHIPPING_METHODS as string[]).includes(value);
}
