# Flow-collection key after a blank line

This is `yaml`, a YAML parser and stringifier for JavaScript.

Prettier's YAML tests found a crash while upgrading to our latest release.
This document is valid YAML and parses in other implementations:

```yaml
? - Detroit Tigers
  - Chicago cubs
: - 2001-07-23

[New York Yankees, Atlanta Braves]: [2001-07-02, 2001-08-12, 2001-08-14]
```

We fail with `IMPOSSIBLE: Map comment with trailing content`. The smallest
reproduction:

```js
YAML.parse('1: 2\n\n[3]: 4')    // throws
YAML.parse('1: 2\n# c\n[3]: 4') // throws
YAML.parse('1: 2\n[3]: 4')      // works
```

## The ask

Find the root cause and fix it.

## Acceptance criteria

- Both reproductions parse with no errors. Each gives a map with two pairs:
  `1 → 2`, and a flow sequence `[3]` → `4`.
- Other forms of block-map keys still parse exactly as before. That includes
  explicit `?` keys (including an empty `?` followed by a flow-collection
  key), block scalars, and anchors or tags on the next key.
- The existing test suite stays green. Add regression tests.

## Constraints

Fix the cause where it happens. Do not catch or suppress the error in the
composer.
