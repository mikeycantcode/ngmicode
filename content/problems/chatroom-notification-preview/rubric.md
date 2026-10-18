## Intended approach
Strip markdown characters from the raw canonical text **first**, then substitute tokens, then un-escape entities
in a **single pass**, then collapse whitespace, then truncate with the exact boundary rules. The candidate should
translate each numbered rule into an unambiguous instruction for the literal agent, including the processing
order (the spec lists it implicitly), and verify with crafted inputs.

## Key files
- `src/domain/preview.ts` (only file that should change)
- `src/domain/mentions.ts` (`unescapeText`, which is sequential but happens to be safe for `&amp;lt;` because `&amp;` is replaced last. The candidate may reuse it or write a single-regex version.)
- Callers: `services/notificationService.ts`, `search/searchService.ts`

## Traps
- **Ordering of markdown stripping vs substitution.** If markdown is stripped after names are inserted, `Mary_Jane` becomes `MaryJane`. The spec says "from the message text", and the candidate has to turn that into an ordering instruction.
- **Token ids contain underscores** (`<@u_000001>`). If markdown is stripped before substitution, the tokens break (`<@u000001>`), so names become unknown. The correct approach strips `_` only *outside* tokens. Few candidates see this coming, and the hidden test catches it.
- **Double un-escape**: `&amp;lt;` must stay `&lt;`.
- Truncation details: the mid-word check uses the character *after* the cut, the space index threshold is `floor(budget/2)`, surrogate handling, and trailing-space trim before the ellipsis.
- RangeError for non-integer and `< 2` maxLen.

## Strong signals
- Spots that stripping `_` conflicts with token ids, and specifies "strip only outside `<...>` tokens" (or substitute via placeholders).
- Gives worked examples to the agent and asks for tests at boundary lengths (exactly `maxLen`, `maxLen+1`, a long single word, an emoji at the cut).
- Reads the produced code against each rule, not just the test results.

## Weak signals
- Pastes the spec and accepts the first output. Doesn't test truncation boundaries.
- Lets the agent "improve" behavior (e.g. stripping `#` or collapsing `@unknown` mentions) beyond the spec.
- Changes callers or the visible tests.

## Follow-up questions
- Why does the spec count UTF-16 code units instead of grapheme clusters? What breaks for a flag emoji or a ZWJ family emoji?
- Your markdown stripping removes `_` from `snake_case` identifiers in normal prose. Is that acceptable? How would you limit it to real emphasis markers?
- Notifications are rendered once at post time. What happens to existing previews when a user renames themselves?
- Where else in the codebase is canonical text rendered, and how would you keep those paths consistent?
