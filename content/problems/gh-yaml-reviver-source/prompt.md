# Reviver source text and raw JSON

This is `yaml`, a widely used YAML 1.1/1.2 parser and stringifier for JavaScript.
Its `parse()` and `stringify()` mirror `JSON.parse()` and `JSON.stringify()`,
including revivers and replacers.

ECMAScript 2026 shipped the **JSON.parse source text access** proposal:

- `JSON.parse(text, reviver)` now calls `reviver(key, value, context)`.
  For primitive values, `context.source` is the exact source text of that value.
  This lets callers rebuild values that lose precision as numbers, such as
  `12345678901234567890` → `BigInt(context.source)`.
- `JSON.rawJSON(text)` creates a value that `JSON.stringify` writes out
  verbatim. `JSON.isRawJSON(value)` detects one.

Users are asking for the same behavior here. Today our reviver gets two
arguments, and a raw JSON value is serialized as an object
(`rawJSON: '"Foo"'`).

## The ask

1. **Reviver context.** Wherever a reviver runs (`YAML.parse(src, reviver)`,
   `parse(src, { reviver })`, `doc.toJS({ reviver })`), call it as
   `reviver.call(holder, key, value, context)`.
   - `context` is always an object.
   - For a value that came from a YAML scalar, `context.source` is that
     scalar's string value **before tag resolution**. It is unescaped and
     unfolded, not the raw YAML bytes. For `n: 0x1F`, `source` is `"0x1F"`.
   - For collections, `context` has no `source`.
   - This applies to every container the reviver visits: plain objects,
     arrays, `Map` (`mapAsMap`), `Set` (`!!set`), `!!omap`, and keys copied
     in by YAML 1.1 merge keys (`<<: *anchor`).
2. **Raw JSON output.** A `JSON.rawJSON(...)` value passed to `stringify()`,
   to `new Document(value)`, or added to a document later (for example
   `doc.value.push(JSON.rawJSON(raw))`) becomes a `Scalar` and is written out
   exactly as its raw text.

## Acceptance criteria

- The reviver call order and `this` values stay as they are today. Only the
  new third argument is added.
- Self-referential documents (an anchor that contains its own alias) must not
  crash the reviver.
- Runtimes without `JSON.rawJSON` keep working.
- The existing test suite stays green.

## Out of scope

Replacer changes. Documentation.
