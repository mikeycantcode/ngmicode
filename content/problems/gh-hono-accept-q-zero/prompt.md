# Honor q=0 in content negotiation

This is **Hono**, the small web framework for Web-standard runtimes. In HTTP content
negotiation, a quality value of `0` means **"not acceptable"** (RFC 9110 §12.5.1, §12.5.4).

## Bug report (honojs/hono#5310)

> `Accept: application/json;q=0` is served `application/json` by the `accepts()` helper.
> Same story with `Accept: application/*;q=0`. And our language detector picks `fr` for
> `Accept-Language: fr;q=0`.

The compression middleware already gets this right, so the rule exists somewhere in the codebase.

## The ask

Fix every place where Hono *picks* a value from an `Accept`-style header so that `q=0`
entries are never chosen.

- `accepts()` with `Accept: application/json;q=0`, supporting only `application/json`, returns the configured default.
- The language detector ignores `q=0` languages. If nothing acceptable remains in the header, it
  moves on to the next detector in `order` (for example the query string), and only then falls back.
- Do **not** change the header parsers. Custom `match` functions and other direct callers must
  still see every entry, `q=0` included.

## Non-goals

Changing how quality values are parsed or sorted. Changing the compression middleware.
