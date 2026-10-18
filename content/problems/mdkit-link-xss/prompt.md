# XSS in rendered comments

User comments are rendered with `new Mdkit()` (defaults: raw HTML off, sanitizing on)
and inserted into the page with `innerHTML`. An external pentest just reported this
proof of concept:

```md
[click me](JaVaScRiPt:alert(document.cookie))
```

Clicking the link runs the script. The pentesters noted they stopped after the first
finding, and that "the URL and escaping code looked like it had been touched recently."

## The ask

- Fix the reported issue.
- Audit the rendering path for **other** ways that user Markdown can produce executable
  HTML: link and image URLs, every way a link can be created, and attribute values. Fix
  everything you find.
- Safe content must keep working: `http(s)`, relative URLs, `mailto:`, and
  `data:image/png|jpeg|gif|webp` images.
- Write a short summary of each vector, its root cause, and the fix. This goes into the
  security advisory.

## Constraints

- Sanitizing is the library's job. "The app should use a CSP" is a fine follow-up, not a fix.
- Don't turn sanitizing off by default for anything, and don't strip legitimate
  Markdown features.
