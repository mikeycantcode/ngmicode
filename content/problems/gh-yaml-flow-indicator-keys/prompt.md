# Keys like `/models/{model}` get quoted on round-trip

This is `yaml`, a YAML parser and stringifier for JavaScript. A team uses it
to patch OpenAPI specs in place: `parseDocument()`, edit, then `String(doc)`.
Their diffs are noisy, because every path key with a template parameter comes
back quoted:

```yaml
# input
paths:
  /models/{model}:
    get: {}
# output
paths:
  "/models/{model}":
    get: {}
```

The unquoted form is valid YAML. Our parser reads it fine. Only the
stringifier insists on quotes.

## The ask

Make the stringifier leave such keys plain when YAML allows it, and back the
change with tests.

YAML 1.2 says plain scalars **inside flow collections** must not contain
`[`, `]`, `{`, `}` or `,`. In block context, a plain implicit key may contain
them, as long as it does not *start* with one.

## Acceptance criteria

- `foo[{}]: bar` and the OpenAPI example above round-trip unchanged.
- Keys and values inside flow collections (`{ ... }`, `[ ... ]`) that contain
  flow indicators are still quoted, so the output re-parses to the same data.
- Keys that start with a flow indicator, or contain a newline, are still
  quoted.
- Add tests that cover block context **and** flow context, for keys and
  values. The existing suite stays green.
