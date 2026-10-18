import { PaymentDeclinedError, ValidationError } from "../shared/errors";
import type { IdGenerator } from "../shared/ids";

export interface Charge {
  id: string;
  amountCents: number;
  reference: string;
  refundedCents: number;
}

export interface PaymentGateway {
  /** Throws PaymentDeclinedError when the card is declined. */
  charge(amountCents: number, token: string, reference: string): Charge;
  /** Partial refunds allowed; total refunded can never exceed the charge. */
  refund(chargeId: string, amountCents: number): Charge;
}

/**
 * In-memory stand-in for the payment provider. Token "tok_decline" is always
 * declined; any other token beginning with "tok_" succeeds.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly charges = new Map<string, Charge>();
  readonly refunds: Array<{ chargeId: string; amountCents: number }> = [];

  constructor(private ids: IdGenerator) {}

  charge(amountCents: number, token: string, reference: string): Charge {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new ValidationError("amount must be positive cents");
    if (!token.startsWith("tok_")) throw new ValidationError("invalid payment token");
    if (token === "tok_decline") throw new PaymentDeclinedError("card declined");
    const charge: Charge = { id: this.ids.next("ch"), amountCents, reference, refundedCents: 0 };
    this.charges.set(charge.id, charge);
    return { ...charge };
  }

  refund(chargeId: string, amountCents: number): Charge {
    const charge = this.charges.get(chargeId);
    if (!charge) throw new ValidationError(`unknown charge ${chargeId}`);
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new ValidationError("amount must be positive cents");
    if (charge.refundedCents + amountCents > charge.amountCents) throw new ValidationError("refund exceeds charge");
    charge.refundedCents += amountCents;
    this.refunds.push({ chargeId, amountCents });
    return { ...charge };
  }
}
