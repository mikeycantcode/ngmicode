## Intended approach
Profile or bisect by input: the time goes into composing the scalar, not lexing it.
`foldLines()` in `src/compose/resolve-flow-scalar.ts` folds the lines of single- and
double-quoted scalars with sticky regexes such as
`[ \t]*(.*?)(?:(?<![ \t])[ \t]*)?\r?\n`. On a final line with N spaces and no newline,
each regex attempt is O(N), and the engine backtracks through every split of the leading
`[ \t]*`. That is O(N²). The fallback regexes, used where lookbehind is missing, are worse.
The upstream fix (PR #699, "use character search for line folding") replaces the regexes
with an `indexOf('\n')` scan. For each line it trims spaces and tabs from both ends with
`charCodeAt` loops, then joins with `' '`, or with `'\n'` across blank lines. It strips `\r`
before `\n`. On the last line it trims only the leading whitespace.

## Key files
- `src/compose/resolve-flow-scalar.ts` (`foldLines`, used by `singleQuotedValue` and `doubleQuotedValue`)
- `src/parse/lexer.ts` (looks guilty but is linear here, a red herring)

## Traps
- **Blaming the lexer.** The lexer scans quoted scalars fast. Timing `lex()` against
  `parse()` shows this.
- **Tweaking the regex.** Adding a possessive-like trick or another lookbehind still
  backtracks, or breaks engines without lookbehind. The acceptance criteria rule both out.
- **Semantics drift in a rewrite.** Common mistakes: trimming trailing whitespace on the
  last line, trimming leading whitespace on the first line, failing to collapse
  consecutive blank lines into `\n` per extra line, and leaving a stray `\r` before CRLF.
  The hidden test checks these, and so do the YAML spec examples in the visible suite.
- **Quadratic string building** with `res = res + …` is fine in V8. Re-slicing the
  remaining source on every line (`source = source.slice(i)`) is not.

## Strong signals
- Measures before and after with growing N (10k, 20k, 40k) and shows the growth rate.
- Explains *why* the regex is quadratic: backtracking over `[ \t]*` against `(.*?)`.
- Asks the agent for a character loop and checks the CRLF, tab, and blank-line rules.
- Adds a regression test with a time budget plus fold-semantics checks.

## Weak signals
- Accepts "regex is slow" without a growth measurement.
- Lets the agent rewrite the whole flow-scalar resolver, or the lexer.
- Never runs the YAML 1.2 spec examples after the rewrite.

## Follow-up questions
- Why is the lookbehind version still quadratic? Which input shape triggers it?
- How would you find other ReDoS-prone regexes in this codebase? Which tools would you use?
- Is a wall-clock assertion a good regression test? What would you do in CI instead?
- Plain multi-line scalars fold too. Does that path share the problem?
