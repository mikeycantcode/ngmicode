# GitHub-compatible heading slugs

Our READMEs are rendered both by GitHub and by mdkit. Deep links copied from GitHub
(`#größe--gewicht`) don't work on our docs site. Our `slugify` is ASCII-only and
collapses dashes, and GitHub's does neither.

Your agent is in **literal mode**: it does exactly what you say and infers nothing.

## The ask

Rewrite `slugify(text)` in `src/render/slugger.ts` to match GitHub's algorithm.
Keep the `Slugger` class's de-duplication exactly as it is today.

## Required behavior of `slugify`

Apply these steps in this order:

1. Trim leading and trailing whitespace.
2. Lower-case (`toLowerCase()`).
3. Remove every character that is **not** one of these:
   - a Unicode letter
   - a combining mark (so a decomposed `é` = `e` + U+0301 keeps its accent)
   - a Unicode number (`²` counts)
   - connector punctuation (`_`)
   - a hyphen `-`
   - whitespace
4. Replace **each** remaining whitespace character (space, tab, …) with one `-`.

There is no collapsing of repeated dashes and no trimming of leading or trailing
dashes after step 4. If the result is empty, the existing `Slugger` fallback
(`section`, `section-1`, …) must still apply.

| Heading text | slug |
|---|---|
| `Café Crème` | `café-crème` |
| `C++ & C#` | `c--c` |
| `a - b` | `a---b` |
| `🚀 Launch!` | `-launch` |
| `--flag_name` | `--flag_name` |
| `!!!` | `section` (via Slugger) |

## Constraints

- Only `src/render/slugger.ts` changes, plus any visible test whose expectation
  encodes the old behavior. Update that expectation. Don't delete the test.
- Update the outdated comment at the top of the file.
