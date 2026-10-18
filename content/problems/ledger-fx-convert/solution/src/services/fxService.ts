import { getCurrency } from "../domain/currency";
import { NoRateError, ValidationError } from "../domain/errors";
import { Money, money } from "../domain/money";
import { decimalDenominator, divRound, isZeroDecimal, parseDecimal } from "../lib/numeric";
import { HOUR_MS, toIso } from "../lib/time";
import type { FxRate } from "../storage/repos";
import type { ServiceContext } from "./index";

/** A rate older than this is treated as missing. */
export const MAX_RATE_AGE_MS = 24 * HOUR_MS;

/** Exact rate as a fraction: 1 unit of `from` = num/den units of `to`. */
interface Fraction {
  num: bigint;
  den: bigint;
}

export class FxService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Records `1 base = rate quote` effective from effectiveAt (default now). */
  setRate(base: string, quote: string, rate: string, effectiveAt?: number): FxRate {
    getCurrency(base);
    getCurrency(quote);
    if (base === quote) throw new ValidationError("base and quote must differ");
    const d = parseDecimal(rate);
    if (isZeroDecimal(d)) throw new ValidationError("rate must be positive");
    const r: FxRate = { base, quote, rate, effectiveAt: effectiveAt ?? this.ctx.clock.now() };
    this.ctx.repos.fxRates.put(r);
    this.ctx.bus.publish("fx.rate_set", { base, quote, rate, effectiveAt: r.effectiveAt });
    return r;
  }

  /** Latest DIRECT rate base->quote with effectiveAt <= at. */
  getRate(base: string, quote: string, at: number = this.ctx.clock.now()): FxRate {
    const r = this.ctx.repos.fxRates.findLatest(base, quote, at);
    if (!r) throw new NoRateError(`no FX rate for ${base}->${quote} at ${toIso(at)}`, { base, quote, at });
    return r;
  }

  /**
   * Converts into `to` minor units. Resolution: direct, inverse, then via USD.
   * Rates older than 24h are ignored. Exact arithmetic, rounded half-even once.
   */
  convert(m: Money, to: string, at: number = this.ctx.clock.now()): Money {
    if (m.currency === to) return m;
    const rate = this.resolve(m.currency, to, at);
    if (!rate) throw new NoRateError(`no FX rate for ${m.currency}->${to} at ${toIso(at)}`, { base: m.currency, quote: to, at });
    const shift = getCurrency(to).exponent - getCurrency(m.currency).exponent;
    let num = BigInt(m.amount) * rate.num;
    let den = rate.den;
    if (shift >= 0) num *= 10n ** BigInt(shift);
    else den *= 10n ** BigInt(-shift);
    return money(Number(divRound(num, den, "half-even")), to);
  }

  private resolve(from: string, to: string, at: number): Fraction | undefined {
    const single = this.leg(from, to, at);
    if (single) return single;
    if (from === "USD" || to === "USD") return undefined;
    const a = this.leg(from, "USD", at);
    const b = this.leg("USD", to, at);
    if (!a || !b) return undefined;
    return { num: a.num * b.num, den: a.den * b.den };
  }

  private leg(from: string, to: string, at: number): Fraction | undefined {
    const direct = this.usable(from, to, at);
    if (direct) {
      const d = parseDecimal(direct.rate);
      return { num: d.units, den: decimalDenominator(d) };
    }
    const inverse = this.usable(to, from, at);
    if (inverse) {
      const d = parseDecimal(inverse.rate);
      return { num: decimalDenominator(d), den: d.units };
    }
    return undefined;
  }

  private usable(base: string, quote: string, at: number): FxRate | undefined {
    const r = this.ctx.repos.fxRates.findLatest(base, quote, at);
    return r && at - r.effectiveAt <= MAX_RATE_AGE_MS ? r : undefined;
  }
}
