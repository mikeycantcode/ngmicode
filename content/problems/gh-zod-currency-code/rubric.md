## Intended approach
Find an existing custom string format to copy. `hostname` and `hex` are the closest:
`core._stringFormat(ZodCustomStringFormat, "<id>", <regex>, params)` in
`src/v4/classic/schemas.ts`, and the `ZodMiniCustomStringFormat` twin in
`src/v4/mini/schemas.ts`. Then:
1. Add `currencyCode` to `src/v4/core/regexes.ts` as an anchored alternation of the
   178 codes from the brief, for example `/^(?:AED|AFN|...|ZWG)$/`.
2. Add `currencyCode()` to Classic and to Mini. Both `external.ts` files re-export the
   schemas modules, so no extra export is needed.
3. Add `currency_code: "currency code"` to the format nouns in `src/v4/locales/en.ts`.
   The real PR (#6595) added a noun to every locale.
4. Add `$ZodCustomStringFormat<"currency_code">` to `$ZodStringFormatTypes` in
   `src/v4/core/schemas.ts`. This is types only.
JSON Schema output comes for free from the custom-format processor. The candidate should
verify that, not assume it.

## Key files
- `src/v4/core/regexes.ts`
- `src/v4/classic/schemas.ts` (`hostname`, `hex`)
- `src/v4/mini/schemas.ts`
- `src/v4/locales/en.ts` (format noun table)
- `src/v4/core/schemas.ts` (`$ZodStringFormatTypes`)
- `src/v4/core/json-schema-processors.ts` (how custom formats are emitted)

## Traps
- **The agent's memorized ISO list.** A model will happily write its own list. That list
  often includes `ANG`/`BGN`/`HRK`/`SLL` or misses `XCG`/`XAD`. The brief says to use the
  given list exactly. Hidden tests check `ANG`, `BGN`, `XCG` and `XAD`.
- **Missing English noun.** Without the `en.ts` entry the message reads
  `"Invalid currency_code"`, not `"Invalid currency code"` (hidden test).
- **Classic only.** Forgetting `zod/mini` (hidden test).
- **Unanchored or case-insensitive regex** (`/[A-Z]{3}/`, `/i`) lets `"usd"` or `" USD"`
  through.
- Building the regex at runtime from an array in a way that does not expose a stable
  `z.regexes.currencyCode` with a `.source` (JSON Schema test compares the pattern).
- Implementing it as `z.string().refine(...)`. That yields `code: "custom"` and no
  `format`, and it does not emit JSON Schema.

## Strong signals
- Asks the agent to find "how is `z.hostname()` implemented end to end" before writing code.
- Pastes the list into the agent instead of asking for "the ISO 4217 codes".
- Checks the error message and JSON Schema output, not just parse success.
- Tests both entry points (Classic and Mini).

## Weak signals
- Accepts a generated code list without diffing it against the brief.
- Adds a new schema class instead of reusing `ZodCustomStringFormat`.
- Never runs the existing string or JSON Schema tests.

## Follow-up questions
- ISO 4217 changes several times a year. How would you keep this list current without a
  breaking change each time? (The real PR added a weekly CI job that regenerates the regex.)
- A user validates historical invoices in `ANG`. What API would you offer them?
- What does a 178-way alternation cost in bundle size, and does it tree-shake for users
  who never call `currencyCode()`?
- Should `"usd"` be accepted and normalized? What would that do to the input and output types?
