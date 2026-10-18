## Intended approach
Reproduce through `maxSatisfying` or the resolver with a tiny registry. Run the visible tests: the
semver ordering test and the parse test fail, which narrows things down quickly. There are **two**
independent bugs:
1. `src/semver/parse.ts`: `toId` was "simplified" to keep every identifier as a string. So
   `compareIdentifiers` never sees numbers and compares `"11" < "2"` lexically. This is the beta.11 symptom.
   Fix: restore numeric conversion in the parser (`/^\d+$/` -> Number). A fix that only patches
   `compareIdentifiers` to sniff numeric strings works for ordering. But it leaves
   `parse().prerelease` returning strings (public API, visible test), so it's the weaker fix.
2. `src/semver/compare.ts`: `comparePrerelease` returns 0 when one identifier list is a prefix of the
   other. §11.4.4 says the longer one wins (`alpha` < `alpha.1`). `maxSatisfying` keeps the first of
   two "equal" versions. This is the alpha symptom.

## Key files
- `src/semver/parse.ts` (`toId` and its misleading comment)
- `src/semver/compare.ts` (`comparePrerelease` and its "perf" comment)
- `src/semver/range.ts` (`maxSatisfying`), `src/resolver/resolver.ts` (consumers)

## Traps
- Stopping after one fix. The two symptoms have different causes.
- Fixing only the comparator while parse still produces strings (ordering works, the visible parse test still fails).
- "Fixing" `maxSatisfying` to prefer later entries on ties, which hides bug 2 instead of fixing it.
- Believing the comments ("kept as written so format round-trips": format round-trips with numbers too).

## Strong signals
- Writes a failing repro test for each symptom before changing code.
- Runs the existing visible suite early and uses the failures as evidence.
- Explains each root cause in terms of §11, and checks that `format()` still round-trips.
- Confirms through the resolver path, not only `compare`.

## Weak signals
- Asks the agent to "fix semver ordering" and accepts a patch without understanding it.
- Sorts with `localeCompare(..., { numeric: true })` or another heuristic.
- Doesn't run the visible tests.

## Follow-up questions
- Why must numeric identifiers have *lower* precedence than alphanumeric ones? Give an example where it matters.
- `1.0.0-alpha.01` is invalid. Where is that enforced, and why does it matter for comparison?
- How would you guard against this class of regression? (Property tests: sort, then check pairwise `compare` is consistent and antisymmetric.)
- The lockfile already contains wrong betas for some users. What's the remediation plan?
