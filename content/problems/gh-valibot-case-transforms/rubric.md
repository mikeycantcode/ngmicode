## Intended approach
1. Orient: find how an existing transformation action is built (`toLowerCase`, `toUpperCase`,
   `trim` under `src/actions/`), how actions are re-exported (`src/actions/index.ts`), and where
   shared internal helpers live (`src/utils/`, `_`-prefixed, re-exported from `src/utils/index.ts`).
2. Write **one** shared internal tokenizer/formatter (upstream: `_formatCase(input, separator,
   capFirst, capRest)` in `src/utils/_formatCase/`) and make each action a three-line wrapper:
   camel `('', false, true)`, pascal `('', true, true)`, snake `('_', false, false)`,
   kebab `('-', false, false)`.
3. Each action: interface extending `BaseTransformation<string, string, never>`, `// @__NO_SIDE_EFFECTS__`
   factory returning `{ kind: 'transformation', type, reference, async: false, '~run' }`, an
   `index.ts`, and a test file; then add to the barrel export.
4. Drive the tokenizer with a table of the prompt's examples before wiring the actions.
Upstream implements it as a single pass over char codes with a 2-char type history
(separator / upper / lower / other). A regex-based splitter is also acceptable if it meets
every rule.

## Key files
- `src/actions/toLowerCase/toLowerCase.ts` (template), `src/actions/index.ts`
- `src/utils/index.ts` (where a shared helper is exported)
- `src/types/pipe.ts` / `BaseTransformation`
- `src/methods/pipe/pipe.ts` (how `~run` is called)

## Traps
- **Four copies of the splitter.** Duplicated logic drifts; one action ends up with different
  acronym handling. Strong candidates insist on one shared helper.
- **Naive regex** like `/([a-z])([A-Z])/g`: misses `parseURLValue`, `XMLHttpRequest`, `123ABC`.
- **Digits as their own words** (`item2Name` → `item_2_name`) or digits ending an acronym
  (`HTTP2` → `http_2`). The PR discussion explicitly kept digits attached.
- **`aBCd` and `iPhone`**: the acronym rule must only fire when the run has two or more capitals.
- **Unicode**: classifying letters with `[A-Za-z]` drops `Ü`/`É`; capitalizing with `word[0]`
  breaks surrogate pairs (Deseret), producing a lone surrogate.
- **Missing barrel export** for one of the four actions.
- **Object shape**: adding `message`/`expects` keys breaks the `toStrictEqual` tests.

## Strong signals
- Spends the first minutes reading one existing transformation action and its test, then
  gives the agent that file as the template.
- Asks the agent for the tokenizer first with a table-driven test of all prompt examples,
  reviews failures, then generates the four wrappers.
- Notices the surrogate-pair requirement and checks it explicitly.
- Runs the full suite at the end (the barrel export affects everything).

## Weak signals
- One-shot prompt "add camel/snake/kebab/pascal actions" and accepts the first diff.
- Tests only `helloWorld`.
- Lets the agent add a dependency (e.g. `change-case`); the library is dependency-free.

## Follow-up questions
- Why a single-pass char-code loop instead of regexes? When does that trade-off matter for a validation library?
- `toCamelCase(toSnakeCase(x))` is not always `x` (`XMLHttpRequest` → `xml_http_request` → `xmlHttpRequest`). Is that acceptable? How would you document it?
- How would you support a user who wants `getURL` → `getURL` (preserve acronyms)? Option, separate action, or no?
- How would you extend this to transform object keys (`snake_case` API payload → camelCase object) while keeping types inferred?
- What would you check before marking these `@beta` vs stable?
