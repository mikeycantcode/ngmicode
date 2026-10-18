# Add `withoutHost`

You maintain **ufo**, a URL-utilities library used by SSR frameworks. Framework
authors keep asking for one helper (issue #211). Their server receives absolute
URLs such as `http://localhost:8000/media/search/movie?query=drive`. For
client-side navigation and same-origin redirects, they need everything **after**
the origin. Today each of them hand-rolls it, often with `new URL()` (which throws
on relative input) or a regex.

## The ask

Ship `withoutHost(input)` as a new public utility. It sits alongside the existing
`with*` / `without*` helpers and follows their conventions.

## Acceptance criteria

- Removes protocol, credentials and host. Keeps path, query and hash exactly as given.
  - `https://example.com/test?foo=123#hash` → `/test?foo=123#hash`
  - `http://localhost:8000/media/search/movie?query=drive` → `/media/search/movie?query=drive`
- The result always starts with `/`.
  - `https://example.com` → `/`
  - `?foo=123#hash` → `/?foo=123#hash`
  - `?` → `/?`
- Never throws, for any string input.
- Exported from the package entry point and documented like its siblings.
  That means a JSDoc block with an example, and a README entry.
- Tests cover the cases above. The existing suite stays green.

## Non-goals

Don't change the behavior of any existing function.
