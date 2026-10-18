# Quoted strings with long whitespace runs are slow to parse

This is `yaml`, a YAML parser and stringifier for JavaScript.

A customer reports that one generated config file, about 60 KB, takes several
seconds to load. A quick bisect of the file points at one double-quoted
value that spans two lines, where the second line has a long run of spaces:

```yaml
description: "summary
                                   …tens of thousands of spaces…  end"
```

We reproduced it. Parsing `"a\n" + " ".repeat(30_000) + "b"` as a quoted
scalar takes about 2 seconds. With 60,000 spaces it takes four times as long.
Single-quoted scalars behave the same way. Anything that parses user-supplied
YAML is exposed, so we treat this as a denial-of-service issue.

## The ask

Find the hot path, explain why it is super-linear, and make it linear.

## Acceptance criteria

- Parsing a quoted scalar is linear in its length, whatever the whitespace
  pattern. The example above parses in a few milliseconds.
- Output is unchanged. Quoted scalars fold exactly as before: line breaks
  become a space, blank lines become `\n`, whitespace around line breaks is
  trimmed, leading whitespace on the first line and trailing whitespace on
  the last line is kept, and `\r\n` behaves like `\n`.
- The fix must work in every JS engine we support, including ones without
  regex lookbehind.
- The existing test suite stays green. Add a regression test.

## Out of scope

Other performance work in the lexer or composer.
