## Intended approach
The candidate splits the rule list into a few small agent requests: one `it` per rule or
pair of rules, with explicit inputs and expected outputs taken from the brief. They run
the tests. Two rules fail, and the candidate investigates `src/frontmatter/yamlLite.ts`:
- `line.split(":")` keeps only `parts[1]`, so `url: https://example.com` becomes `"https"`
  and `time: 12:30` becomes `12`. Fix: split on the first colon (`indexOf`).
- `stripComment` cuts at the first `" #"` regardless of quotes, so `title: "C# # tips"` loses
  its tail and then fails as an unterminated string. Fix: scan with quote tracking, and only
  treat `#` as a comment at the line start or after whitespace.
All the other rules already pass. Those tests are still valuable as coverage.

## Key files
- `src/frontmatter/yamlLite.ts` (`stripComment`, `parseYamlLite`)
- `src/frontmatter/frontmatter.ts` (fences, CRLF, line offsets)
- `tests/frontmatter.test.ts`

## Traps
- **Expected values from the code.** If the agent writes expectations by running the
  parser, it will "document" `url: "https"`. The candidate must derive expectations from the brief.
- **Splitting on `": "`.** This fixes URLs but not `time: 12:30`. The value is everything
  after the *first* colon followed by a space, and the key can't contain colons.
- **Comment regex.** `/\s#.*$/` still breaks quoted `#`. A full-line `# comment` must still be stripped.
- **Weak-agent context.** A single giant prompt with all 7 rules tends to produce
  shallow or duplicated tests from a small model.

## Strong signals
- Feeds the agent one rule at a time, with concrete inputs and expected outputs.
- When a test fails, reads the code before deciding which side is wrong, and says so.
- Adds edge cases beyond the brief's examples (a colon in a quoted value, CRLF, `...` fence).
- Reports bugs clearly: input → actual → expected → fix.

## Weak signals
- Lets the agent modify expectations until green.
- Fixes code without a failing test first.
- Writes one mega-test covering everything.

## Follow-up questions
- How do you stop an agent from writing tests that just encode current behavior?
- Should the parser reject `a:b`, or treat it as a string key `a:b` with a null value? Which is more user-friendly?
- What would change in this parser to support nested maps, and which of your tests protect you during that change?
- Would you consider property-based tests here? What property would you check?
