# Open redirect through `withoutBase`

You maintain **ufo**, a small URL-utilities library used by several web frameworks.
One of those frameworks serves apps under a mount prefix. For legacy links it strips
the prefix with `withoutBase(input, base)` and sends the browser a `302` whose
`Location` header is the result.

A security researcher sent this report:

> A request to `/legacy//evil.com` on an app mounted at `/legacy` redirects the
> victim to `https://evil.com`. Browsers read the `Location` value as a
> protocol-relative URL. This is an open redirect usable for phishing.

## The ask

Reproduce the report against the library, find the root cause, and fix it in ufo.
Downstream frameworks should not need to change.

## Acceptance criteria

- `withoutBase` must never return a protocol-relative URL (a value starting with
  two or more slashes), whatever the base or the input.
- Any run of slashes right after the base collapses to a single `/`. For example,
  `withoutBase("/legacy///evil.com", "/legacy")` returns `"/evil.com"` and
  `withoutBase("/legacy//", "/legacy")` returns `"/"`.
- This holds whether or not the base has a trailing slash.
- All existing behavior and tests stay green. That includes "no false prefix
  match": `/admin-dashboard` does not carry base `/admin`.

## Constraints

Keep the fix minimal and inside the library. Don't change any public signature.
