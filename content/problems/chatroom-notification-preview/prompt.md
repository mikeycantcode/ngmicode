# Notification previews

Push notifications and the search results list show a one-line preview of a
message. They come from `renderPreview(text, ctx, maxLen)` in
`src/domain/preview.ts`. Design filed three bugs against the current output:

- Raw markdown shows up in previews (`*urgent*`, `` `npm test` ``).
- Unknown users and channels render as raw ids (`@u_000042`).
- Truncation cuts words in half and can split an emoji.

Rewrite `renderPreview` to the spec below. Your agent is in **literal mode**.
It implements exactly what you tell it. You're scored on how precisely you
specify the behavior.

## Input

`text` is canonical message text, as stored on `Message.text`. User input has
`&`, `<`, `>` escaped as `&amp;`, `&lt;`, `&gt;`. Mentions are tokens:
`<@USER_ID>`, `<#CHANNEL_ID>`, `<!here>`, `<!channel>`, `<!everyone>`.
`ctx.userName(id)` returns a display name or `undefined`.
`ctx.channelName(id)` returns a channel name or `undefined`.

## Required output

1. `maxLen` must be an integer ≥ 2. Otherwise throw `RangeError("maxLen must be an integer >= 2")`.
2. Remove the formatting characters `*`, `_`, `~` and `` ` `` from the **message text**. Display names and channel names inserted in step 3 are never altered. A user named `Mary_Jane` stays `@Mary_Jane`.
3. Replace tokens:
   - `<@ID>` becomes `@` + display name. If the user is unknown, use `@unknown`.
   - `<#ID>` becomes `#` + channel name. If the channel is unknown, use `#unknown`.
   - `<!here>`, `<!channel>` and `<!everyone>` become `@here`, `@channel` and `@everyone`.
4. Un-escape `&lt;` to `<`, `&gt;` to `>` and `&amp;` to `&`. `&amp;lt;` must become the literal text `&lt;`. Do not un-escape twice.
5. Collapse every run of whitespace, including newlines, into a single space, then trim.
6. If the result has at most `maxLen` UTF-16 code units, return it unchanged. Otherwise truncate:
   - Let `budget = maxLen - 1`. Take the first `budget` code units.
   - If the character right after the cut is not a space, the cut is mid-word. In that case, if the kept part contains a space at an index `>= floor(budget / 2)`, cut back to the last such space. Otherwise keep the hard cut.
   - If the kept part now ends with a high surrogate (the first half of an emoji), drop it.
   - Trim trailing whitespace, then append `…` (U+2026, one character).
   - The result is therefore never longer than `maxLen`.

## Constraints

- Change only `src/domain/preview.ts`. Keep the `renderPreview` and `PreviewContext` signatures.
- Notifications use `maxLen = 80` and search uses 120. Their callers must not change.
- Visible tests must keep passing.
