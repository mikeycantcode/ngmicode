# Character classes in glob patterns

Ops runs `SCAN 0 MATCH session:[0-9]*` and gets nothing back. Our glob matcher
(`src/util/glob.ts`) supports only `*` and `?`. Extend it.

Your agent is in **literal mode**. Delegate precisely: say what to change,
where, and what must not change.

## Required syntax

| Pattern | Matches |
|---|---|
| `*` | any sequence of characters, including none (unchanged) |
| `?` | exactly one character (unchanged) |
| `[abc]` | exactly one character that is `a`, `b` or `c` |
| `[a-z]` | exactly one character in the inclusive range `a`..`z` (by UTF-16 code unit). A reversed range like `[z-a]` means the same as `[a-z]` |
| `[^abc]` | exactly one character that is **not** in the set. Only `^` negates; `[!a]` is the two-character set `!` and `a` |
| `\x` | the character `x` literally, outside or inside a class (`\*`, `\[`, `\\`, `[\]]`) |

Edge rules:

- A `-` that is first or last inside a class is a literal `-` (`[-a]`, `[a-]`).
- A `[` with no closing `]` is a literal `[` (`x[1` matches the key `x[1`).
- A `\` at the very end of the pattern matches a literal `\`.
- Every other character is literal. Key names can contain `.`, `+`, `(`, `$`,
  `|` and so on, and these must keep matching only themselves.

## Where it applies

Users expect identical pattern semantics everywhere a pattern is accepted:
`KEYS`, `SCAN ... MATCH`, `CONFIG GET` and `PSUBSCRIBE`. Today these do not
all share one implementation. Find out which code each one uses before you
delegate.

## Constraints

- Keep matching linear-ish. No exponential backtracking on patterns like `*a*a*a*a*b`.
- No regex construction from user input.
- Existing behavior for `*` and `?` must not change.
