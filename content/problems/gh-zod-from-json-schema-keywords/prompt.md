# Enforce dropped JSON Schema keywords

`z.fromJSONSchema()` turns a JSON Schema document into a Zod schema. A user filed this:

> We generate Zod validators from our OpenAPI components. A schema with
> `"uniqueItems": true` accepted `[1, 1]`. A schema with `"minProperties": 1` accepted
> `{}`. No error, no warning. The keywords are just ignored.

That is true for six keywords: `minProperties`, `maxProperties`, `uniqueItems`,
`contains`, `minContains` and `maxContains`. Silently accepting invalid data is the worst
failure mode for a validator.

## The ask

Make `fromJSONSchema` enforce all six, with JSON Schema 2020-12 semantics.

### Object keywords
- `minProperties` / `maxProperties` count the **input's own keys**, as received. A
  property filled in by a `default` does not count toward the minimum. A `__proto__` key
  in parsed JSON is still a key and does count.
- Failures are `too_small` / `too_big` issues with `origin: "object"` and
  `minimum` / `maximum` set.
- They must compose with `propertyNames`: `{}` fails `minProperties: 1` with
  `too_small`, and `{ b: 1 }` fails `propertyNames: { pattern: "^a" }` with
  `invalid_key`.

### Array keywords
- `uniqueItems: true` rejects structural duplicates using JSON equality. `{a:1,b:2}` and
  `{b:2,a:1}` are equal. `1`, `"1"` and `true` are all different. Report a `custom`
  issue at the path of the later duplicate (for example `[1]`).
- `contains` requires at least one matching item. `minContains` (default 1) and
  `maxContains` bound the number of matches. `minContains: 0` accepts an empty array.
- Like the object keywords, these see the **input** items, not items after nested
  defaults were applied.

### Round trip
`z.toJSONSchema(fromJSONSchema(doc))` must still emit these keywords
(`minProperties`, `maxProperties`, `uniqueItems`, `contains`, `minContains`,
`maxContains`), so converting back and forth does not lose them.

## Acceptance criteria
- The behaviors above hold, and the existing `fromJSONSchema` and `toJSONSchema` tests pass.
- No change to the public API.

## Non-goals
`unevaluatedProperties`, `unevaluatedItems`, `dependentSchemas`. Performance work beyond
"don't be accidentally quadratic on a large array".
