# Format money for finance

Finance is moving the refund and invoice emails onto `formatCents` in
`src/shared/money.ts`. Today it is `$${(cents / 100).toFixed(2)}`, which has no
thousands separators, prints negative amounts as `$-12.50`, and goes through
floating point.

Your agent is in **literal mode**: it does exactly what you tell it and infers
nothing. Your job is to specify the behavior precisely enough that it gets it right
the first time.

## The ask

Rewrite `formatCents(cents: number): string` (same name, same file, same signature)
so that:

| input | output |
|---|---|
| `0` | `$0.00` |
| `5` | `$0.05` |
| `1250` | `$12.50` |
| `100000` | `$1,000.00` |
| `123456789` | `$1,234,567.89` |
| `-5` | `-$0.05` |
| `-123456` | `-$1,234.56` |

## Acceptance criteria

- Format is: optional `-`, then `$`, then the whole-dollar part with a `,` between
  every group of three digits, then `.` and **exactly two** cent digits.
- The minus sign goes **before** the `$`.
- `-0` formats as `$0.00` (never `-$0.00`).
- If `cents` is not an integer (including `NaN`, `Infinity` and `12.5`), throw a
  `RangeError` whose message is `cents must be an integer`.
- Must be exact for any safe integer (e.g. `100000000000` → `$1,000,000,000.00`).

## Constraints

- Do not use `toLocaleString` or `Intl` — output must not depend on the runtime's locale.
- Do not change any other function in the file.
