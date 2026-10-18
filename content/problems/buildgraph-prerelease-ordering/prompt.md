# Bug report: `install` locks an older prerelease

From the #build-infra channel this morning:

> We publish `@acme/design-tokens` betas daily. With `"@acme/design-tokens": "^3.0.0-beta.1"`,
> `buildgraph install` locked **3.0.0-beta.2** even though **3.0.0-beta.11** is on the registry.
> Clearing the lockfile doesn't help.

> Possibly related: with `^1.0.0-alpha`, we have both `1.0.0-alpha` and `1.0.0-alpha.1`
> published, and install locks `1.0.0-alpha`, the older one.

A release of the semver code went out last week ("perf cleanups"). Nobody has looked at the
visible test suite since then.

## Your task

1. Reproduce both symptoms.
2. Find the root cause(s) and fix them. Every symptom must trace back to a cause.
3. Make sure the fix holds everywhere versions get ordered: `compare`, sorting, `maxSatisfying`,
   and the resolver.

Be ready to explain each root cause, why the existing comments were misleading, and how you
confirmed the fix.

## Constraints
- SemVer 2.0.0 §11 is the spec for precedence.
- Keep `format()` output unchanged for any valid version.
