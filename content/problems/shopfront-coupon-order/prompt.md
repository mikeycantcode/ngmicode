# The over-generous coupon

**Support ticket #5521**

> Customer bought 2 × Cast Iron Pan 10" ($35.00 each) during the 20%-off kitchen
> promotion and used coupon `SAVE10`. Finance says the order should have been
> **$50.40** before tax, but the customer was charged **$49.00** before tax. Customer is happy, finance
> is not. Is the coupon broken? Are other orders affected?

Finance's pricing contract is documented in the codebase. You are new to this
service. Use your AI pair to understand how a cart gets priced.

## Your task

1. Explain where the $1.40 difference comes from, using the code's documented pricing contract.
2. Fix the code so every quote follows the documented contract again.
3. In your final message, state the root cause in one or two sentences and the **blast radius**:
   which kinds of carts were mispriced, and in which direction. Think beyond the ticket's
   exact cart (for example, coupons with a minimum spend).

## Constraints

- The documented contract is correct. Change the code, not the documentation.
- Keep the fix minimal.
