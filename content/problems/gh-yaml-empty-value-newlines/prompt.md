# Blank lines double on every round-trip

This is `yaml`, a YAML parser and stringifier for JavaScript. Many tools use
it to edit config files in place: parse with `parseDocument()`, change a
value, then write back with `String(doc)`. Users expect untouched parts of
the file to come back byte for byte.

A user reports this:

```js
const src = `map:
  item:

anothermap:
  anotheritem:

`
String(YAML.parseDocument(src))
// "map:\n  item:\n\n\nanothermap:\n  anotheritem:\n\n\n"
```

Each blank line after a key with an empty value becomes two. Run the tool
again and the file keeps growing.

## The ask

This is a code-reading round. First, use the agent to **explain** how a map
pair is stringified. Cover where the whitespace between a key and its value
comes from, and why this input gets an extra newline. Then make the smallest
fix.

## Acceptance criteria

- The example above round-trips unchanged.
- Pairs with an empty value that carries a comment, with a blank line before
  it, still stringify as they do today.
- The existing test suite stays green. Add a regression test.
