import { getCurrency } from "../domain/currency";
import { NoRateError, ValidationError } from "../domain/errors";
import { Money, money } from "../domain/money";
import { decimalDenominator, divRound, isZeroDecimal, parseDecimal } from "../lib/numeric";
import { toIso } from "../lib/time";
import type { FxRate } from "../storage/repos";
import type { ServiceContext } from "./index";

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

  /**
   * Latest DIRECT rate base->quote with effectiveAt <= at.
   * TODO(LEDG-340): inverse pairs and USD triangulation — treasury only loads
   * direct pairs today, so callers must make sure the pair exists.
   */
  getRate(base: string, quote: string, at: number = this.ctx.clock.now()): FxRate {
    const r = this.ctx.repos.fxRates.findLatest(base, quote, at);
    if (!r) throw new NoRateError(`no FX rate for ${base}->${quote} at ${toIso(at)}`, { base, quote, at });
    return r;
  }

  /**
   * Converts into `to` minor units. Exact arithmetic, rounded half-even once:
   *   result = amount * rate * 10^(toExp - fromExp)
   */
  convert(m: Money, to: string, at: number = this.ctx.clock.now()): Money {
    if (m.currency === to) return m;
    const rate = parseDecimal(this.getRate(m.currency, to, at).rate);
    const shift = getCurrency(to).exponent - getCurrency(m.currency).exponent;
    let num = BigInt(m.amount) * rate.units;
    let den = decimalDenominator(rate);
    if (shift >= 0) num *= 10n ** BigInt(shift);
    else den *= 10n ** BigInt(-shift);
    return money(Number(divRound(num, den, "half-even")), to);
  }
}
