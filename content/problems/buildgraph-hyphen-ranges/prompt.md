# Hyphen ranges in `src/semver/range.ts`

Teams are migrating manifests from another tool that writes ranges like `"1.2.3 - 2.3.4"`.
Today `new Range("1.2.3 - 2.3.4")` throws `Invalid range`. Add hyphen-range support to the
range parser in `src/semver/range.ts`.

Your instructions to the agent are graded for precision. The difficulty is in the
boundaries, so specify them precisely.

## Semantics

A hyphen range is `A - B`: two bare versions separated by a hyphen with whitespace on
**both** sides. It can be one alternative of a `||` union (`1 - 2 || ^5`).

**Lower bound `A`**
- Full version → `>=A`, prerelease kept (`1.2.3-rc.1 - 2.0.0` → `>=1.2.3-rc.1 <=2.0.0`).
- Partial version → missing parts become 0 (`1.2 - …` → `>=1.2.0`).
- `*` / `x` → no lower bound.

**Upper bound `B`**
- Full version → `<=B` (inclusive).
- Partial version → everything *within* that partial is included:
  `… - 2.3` → `<2.4.0-0`, `… - 2` → `<3.0.0-0`.
- `*` / `x` → no upper bound.

`Range#toString()` must render exactly:

| Input | `toString()` |
|---|---|
| `1.2.3 - 2.3.4` | `>=1.2.3 <=2.3.4` |
| `1.2 - 2.3.4` | `>=1.2.0 <=2.3.4` |
| `1.2.3 - 2.3` | `>=1.2.3 <2.4.0-0` |
| `1.2.3 - 2` | `>=1.2.3 <3.0.0-0` |
| `* - 2.0.0` | `<=2.0.0` |
| `1.0.0 - *` | `>=1.0.0` |
| `* - *` | `*` |
| `1 - 2 \|\| ^5.0.0` | `>=1.0.0 <3.0.0-0 \|\| >=5.0.0 <6.0.0-0` |

## Must stay errors / non-hyphen

- `1.2.3-2.3.4` (no spaces) is **not** a hyphen range. It is the exact prerelease version `1.2.3-2.3.4`, as today.
- Anything else containing a standalone `-` must throw `SemverError` with a message
  containing `Invalid range`. Examples: `1 - 2 - 3`, `- 2`, `1.2.3 -`, `>=1 - 2`, `1 - 2 <3`.
- The existing prerelease rule still applies to the comparators a hyphen range produces.

## Non-goals

Don't change caret/tilde/x-range behavior, `satisfies`, or any other file.
