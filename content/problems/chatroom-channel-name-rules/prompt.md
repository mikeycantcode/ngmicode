# Channel name rules

Product wants channel names to follow the same rules as Slack. Today
`normalizeChannelName` in `src/domain/channelName.ts` only trims, lowercases,
and turns whitespace into hyphens. Users have created channels named
`!!!`, `__ops__`, and `here`. The last one breaks `#here` / `@here` handling.

Your agent is in **literal mode**. It does exactly what you tell it and infers
nothing. You're scored on how precisely you specify the change.

## Required behavior

`normalizeChannelName(raw: string): string` must return the normalized name,
or throw a `ValidationError` (from `src/util/errors.ts`) with field `"name"`.

1. Lowercase the input.
2. Replace every run of whitespace, underscores (`_`), and periods (`.`) with one hyphen. A run can mix these characters.
3. Remove every character that is not `a-z`, `0-9`, or `-`. There is no transliteration, so `é` is removed.
4. Collapse runs of hyphens into one hyphen.
5. Strip leading and trailing hyphens.
6. If the result is longer than 80 characters, keep the first 80. The result must still never end in a hyphen.
7. If nothing is left, throw `ValidationError("channel name must contain a letter or digit", "name")`.
8. The names `here`, `channel` and `everyone` are reserved. If the *normalized* name is one of them, throw
   `ValidationError('"<name>" is a reserved name', "name")`, for example `"here" is a reserved name`.

Examples:

| input | result |
|-------|--------|
| `"  Design_Team.Q3 "` | `"design-team-q3"` |
| `"a - b"` | `"a-b"` |
| `"Café Ops!"` | `"caf-ops"` |
| `"@Here"` | throws `"here" is a reserved name` |

## Constraints

- Change only `src/domain/channelName.ts`. Keep the export names `normalizeChannelName` and `MAX_CHANNEL_NAME`.
- Channel create and rename already call this function. Don't change them.
- Existing visible tests must keep passing.
