# `javascript:` URLs slip past the sanitizer

You maintain **ufo**, a URL-utilities library. A popular CMS uses it to sanitize
user-supplied links before rendering `<a href>`:

```ts
const { protocol } = parseURL(href);
if (isScriptProtocol(protocol)) href = "#";
```

A security researcher sent this report:

> The payload `"\u0000javascript:alert(document.domain)"` is rendered as a live link.
> Browsers strip leading C0 control characters and spaces from URLs before parsing
> (WHATWG URL spec), so clicking it runs the script. I suspect there are more
> variants.

## The ask

Treat this as a security review of how ufo detects protocols. Find every way a
script URL can get past the check above. Fix them in the library and prove it.

## Acceptance criteria

- `parseURL` reports the correct `protocol` for `javascript:` and `vbscript:` URLs,
  with or without leading whitespace or NUL bytes. For those URLs, `pathname` is
  everything after the scheme, and `href` is the URL without the leading junk.
- Leading whitespace and NUL bytes are ignored consistently by `parseURL`,
  `hasProtocol` (all modes) and `isScriptProtocol`. `"\0https://invalid.com"`
  parses with host `invalid.com`, and `normalizeURL("\0http://google.com")` returns
  `"http://google.com"`.
- Nothing else regresses. Existing tests stay green, including case-insensitive
  schemes (`JavaScript:`) and protocol-relative URLs (`//host`).

In your final message, list each bypass you found and the input that triggers it,
then how you fixed and verified it. Rank them by severity.

## Constraints

Keep public signatures unchanged. Don't throw on bad input: the library's utils
never throw.
