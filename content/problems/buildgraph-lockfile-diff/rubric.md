## Intended approach
Candidate dictates the algorithm: build `Map<name, Map<version, integrity>>` for each lockfile with
`parseLockKey`, iterating keys in sorted order so the first key wins for integrity. Compute set
differences per name over the union of names. Apply the exactly-one-gone/one-new rule. Sort with
`compare` from `src/semver/compare.ts`, not string compare. Then a second, separate instruction
adds `diff` to `install`, computing `prev` from the already-parsed previous lockfile (or null).

## Key files
- `src/resolver/lockfile.ts` (`Lockfile`, `parseLockKey`: the name/spec split is non-trivial for scoped names)
- `src/semver/compare.ts` (`compare`)
- `src/cli/commands.ts` (`install`)

## Traps
- **Multiple versions per name.** For example, react 17 and 18 both locked, and only 18 bumps.
  A per-key or per-name single-version diff produces nonsense. The exactly-one rule exists for this.
- **Semver vs string sort.** "4.17.10" < "4.17.9" as strings.
- **Spec churn isn't change.** Adding `lodash@~4.17.20` that resolves to the already-locked
  4.17.21 must produce an empty diff.
- Scoped names (`@acme/x@^1`): splitting on the first `@` breaks. Reuse `parseLockKey`.
- Integrity-only change (same version re-published or tampered) must surface. It's the security-relevant line.
- `prev === null` on first install.

## Strong signals
- Writes the rules as numbered steps with the data structure named. Tells the agent which helpers to reuse.
- Splits the work into two delegations (pure function, then CLI wiring) and checks each one.
- Gives the agent 2–3 concrete fixtures (multi-version, semver sort, integrity) to test with.

## Weak signals
- Pastes the brief and accepts whatever comes back.
- Doesn't notice the agent sorted with `localeCompare` or `<`.
- Lets the agent re-parse the lockfile text in the CLI instead of reusing the parsed previous lockfile, or forgets the null case.

## Follow-up questions
- Why is "exactly one gone and one new" the threshold for `changed`? What would a reviewer want for 2 gone / 1 new?
- Integrity changed but the version didn't: what could cause that, and should `install --frozen` fail on it?
- How would you show *why* a transitive package changed (which top-level spec pulled it in)?
- Would you diff on (name, version) or on (name, spec)? Argue the trade-off for a reviewer.
