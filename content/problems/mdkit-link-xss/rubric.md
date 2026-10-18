## Intended approach
Start from the PoC, then audit systematically. Every path from user text to an attribute
or URL needs a check. Three regressions were injected:
1. **`src/util/url.ts` `isSafeUrl`** was weakened to `!url.trim().startsWith("javascript:")`.
   That is case-sensitive, ignores `vbscript:` and `data:text/html`, and ignores control
   characters. Restore a denylist on a normalized probe (strip `\u0000-\u0020`, lower-case),
   keeping the `data:image/(gif|png|jpeg|webp);` allowance. Better still, use a scheme
   allowlist. Destinations are entity-decoded at parse time, so `&#74;avascript:` arrives
   as `Javascript:`.
2. **`src/render/html.ts`, autolinks**: a "hot path" returns `<a href>` for
   `node.autolink` before the `isSafeUrl` check. Remove it. `<javascript:alert(1)>` is a
   valid autolink per CommonMark.
3. **`src/util/escape.ts` `escapeHtml`** no longer escapes `"`. `escapeAttr` builds on it,
   so every attribute (title, alt, class from a fence info string, href) can be broken out
   of. Restore `"` → `&quot;`, or at minimum make `escapeAttr` escape it independently. The
   visible test that was "simplified" to match should be restored.
Image `src` goes through the same `isSafeUrl`, so fix 1 covers it. Raw HTML is already
escaped with `html: false`. The candidate should confirm this rather than assume it.

## Key files
- `src/util/url.ts` (`isSafeUrl`)
- `src/render/html.ts` (`case "link"`, `case "image"`, `attrs`, code `class`)
- `src/util/escape.ts` (`escapeHtml`, `escapeAttr`)
- `src/inline/links.ts`, `src/inline/rules.ts` (where hrefs come from: inline, reference, autolink)
- `tests/render.test.ts` (an escaping assertion was weakened)

## Traps
- **Stopping at the PoC.** Adding `.toLowerCase()` fixes the report, but leaves
  `vbscript:`, `data:text/html`, autolinks and attribute breakout open. Hidden tests 1–3
  each cover a different vector.
- **The autolink fast path** sits in the renderer, not the URL helper. Auditing only `url.ts` misses it.
- **The escaping regression is indirect.** `escapeAttr` looks fine on its own. The bug is
  in the helper it calls. The fence info-string `class` and image `alt` are easy to forget.
- **Over-blocking.** Blocking all `data:` breaks the allowed image types. Blocking
  `mailto:` breaks email links. Hidden test 1 checks the safe cases.
- **Fixing at parse time only.** Rejecting URLs in `links.ts` misses reference
  definitions and autolinks unless each path is handled. The renderer is the choke point.

## Strong signals
- Enumerates sinks (`href`, `src`, every attribute) and sources (inline links, references, autolinks, images, fence info), then checks each pair.
- Prefers an allowlist of schemes, or explains the denylist trade-off.
- Has the agent write a table-driven XSS regression test with many encodings.
- Notices and restores the weakened visible test.
- Writes a crisp advisory: vector → root cause → fix.

## Weak signals
- Patches the single PoC and stops.
- Lets the agent add a regex HTML sanitizer over the final output.
- Relies on "use CSP" as the fix.

## Follow-up questions
- Allowlist or denylist for URL schemes: which would you ship, and what breaks with each?
- Why decode entities *before* checking the scheme? What if the check ran before decoding?
- The app inserts the output with `innerHTML`. What else should the app layer do (CSP, Trusted Types, iframe sandbox)?
- How would you prevent a future "performance" change from removing a security check again (tests, ownership, lint)?
- If `html: true` were enabled for trusted authors, what would you need in addition?
