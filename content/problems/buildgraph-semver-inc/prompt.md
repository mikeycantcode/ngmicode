# Version bumping: `inc()`

We're adding a `buildgraph version <bump>` command. Before we build the command, we need
the core function. Your instructions to the agent are graded
for precision. Your score depends on how precisely you specify the behavior.

## The ask

Create `src/semver/inc.ts` exporting:

```ts
export type ReleaseType = "major" | "minor" | "patch" | "prerelease";
export function inc(version: string, release: ReleaseType, preid?: string): string;
```

It returns the bumped version as a canonical string: no leading `v`, no build metadata.

## Required behavior

| Input | Result |
|---|---|
| `inc("1.2.3", "major")` | `2.0.0` |
| `inc("2.0.0-rc.1", "major")` | `2.0.0` (a prerelease of x.0.0 just drops its prerelease) |
| `inc("2.1.0-rc.1", "major")` | `3.0.0` |
| `inc("1.2.0-beta", "minor")` | `1.2.0` |
| `inc("1.2.3-beta", "minor")` | `1.3.0` |
| `inc("1.2.3-beta.4", "patch")` | `1.2.3` |
| `inc("v1.2.3+build.7", "patch")` | `1.2.4` |
| `inc("1.2.3", "prerelease")` | `1.2.4-0` |
| `inc("1.2.3", "prerelease", "beta")` | `1.2.4-beta.0` |
| `inc("1.2.3-beta.9", "prerelease")` | `1.2.3-beta.10` |
| `inc("1.2.3-beta", "prerelease")` | `1.2.3-beta.0` |
| `inc("1.0.0-beta.2.hotfix", "prerelease")` | `1.0.0-beta.3.hotfix` (the right-most *numeric* identifier is incremented) |
| `inc("1.2.3-alpha.3", "prerelease", "beta")` | `1.2.3-beta.0` |
| `inc("1.2.3-beta.2", "prerelease", "beta")` | `1.2.3-beta.3` |

- An invalid version throws a `SemverError` with the message `Invalid version: "<input>"`.
- An unknown release type throws a `SemverError` with the message `Invalid release type: "<release>"`.
- The function must not mutate anything it receives or anything it gets from the parser.

## Constraints

- Reuse the existing parser and formatter in `src/semver/parse.ts`. Do not write a second version regex.
- Don't modify other files.
