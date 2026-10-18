## Intended approach
Start from the sanitizer snippet and test payloads through it, not just the one
reported. The candidate should find **two** distinct bypasses, then the consistency gaps:

1. **Plain `javascript:alert(1)` already bypasses** (the most severe finding, which the
   report missed). `parseURL` special-cases only `blob:`/`data:`. Everything else falls
   through to the main regex, which requires `//` after the scheme. On a mismatch the
   whole destructure defaults to `""`, so `protocol` is `""` and `isScriptProtocol("")`
   is `false`.
2. **Leading NUL/whitespace** (`"\0javascript:…"`, `" javascript:…"`). `hasProtocol`
   returns `false` because `PROTOCOL_REGEX` is anchored on `\w`, so `parseURL` routes
   the input to `parsePath`, which has no `protocol` at all.
3. `isScriptProtocol("\0vbscript:")` is `false`, and `hasProtocol(" javascript:…")` is `false`.
   Any consumer that calls these directly is also exposed.
4. `"\0https://invalid.com"` is parsed as a path, so `normalizeURL` returns a
   relative-looking string.

The real fix (unjs/ufo#170): `parseURL`'s special-protocol branch becomes
`/^[\s\0]*(blob:|data:|javascript:|vbscript:)(.*)/i`, returning
`href: proto + pathname` (leading junk dropped). The main regex gets a `^[\s\0]*`
prefix. `PROTOCOL_STRICT_REGEX`/`PROTOCOL_REGEX` accept `[\s\w\0+.-]` in the scheme
run, and `PROTOCOL_SCRIPT_RE` gets a `^[\s\0]*` prefix.

## Key files
- `src/parse.ts` — `parseURL` (special-protocol branch, main regex)
- `src/utils.ts` — `PROTOCOL_STRICT_REGEX`, `PROTOCOL_REGEX`, `PROTOCOL_SCRIPT_RE`, `hasProtocol`, `isScriptProtocol`
- `test/parse.test.ts`, `test/utilities.test.ts`, `test/normalize.test.ts`

## Traps
- Fixing only the reported `\0` payload. Plain `javascript:` still yields `protocol: ""`.
  The hidden tests check both.
- Patching only `isScriptProtocol`. `parseURL` never hands it a protocol, so the sanitizer stays broken.
- Trimming with `input.trim()`. That also strips *trailing* whitespace, which is
  meaningful in paths. `trim()` also doesn't remove all C0 controls, and it fixes
  `parseURL` but not `hasProtocol`'s regex path.
- Lowercasing `href`. Upstream keeps the original scheme casing in `href` and lowercases only `protocol`.
- Breaking protocol-relative detection (`PROTOCOL_RELATIVE_REGEX`, `"/\t//test.com"`)
  while loosening the regexes.
- Changing `hasProtocol("javascript:…", { strict: true })` to `true`. Strict mode
  requires `:/`, and the expected value stays `false`.

## Strong signals
- Builds a payload matrix: plain / `\0` / space / tab / mixed-case schemes ×
  `javascript:` / `vbscript:` / `data:`, run through the exact sanitizer snippet.
- Discovers that plain `javascript:` is broken and ranks it highest.
- Cites the WHATWG rule: strip leading/trailing C0 control-or-space, remove tab/newline.
  Then decides deliberately how far to follow it.
- Keeps the three functions consistent and explains why consistency is the security property.
- Adds tests to the existing tables rather than ad-hoc files.

## Weak signals
- Asks the agent to "fix the XSS" and accepts the first diff.
- No reproduction through `parseURL` + `isScriptProtocol` together.
- Recommends a denylist in the CMS instead of fixing the library, or an allowlist without fixing the library.

## Follow-up questions
- Browsers also strip tabs and newlines *inside* the scheme (`java\tscript:`). Does your fix handle that? Should a sanitizer rely on parsing at all, versus an allowlist of `http:`/`https:`/`mailto:`?
- The maintainer worried that `hasProtocol(" javascript:")` silently returning `true` hides bad input. Would you throw, return a flag, or normalize? What about backwards compatibility?
- Why is `data:` in the script list? Which `data:` URLs are actually dangerous in an `href` today?
- How would you fuzz this function against a real browser's URL parser?
