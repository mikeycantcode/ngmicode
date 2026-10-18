# Authoring SteerCode problems

SteerCode trains people for **AI-assisted coding interviews**: the candidate works in a
VS Code-like browser IDE with a coding agent, against a realistic codebase, under a timer.
An LLM grader then scores *how they steered the agent*, and an LLM interviewer asks follow-ups.
Hidden tests are deliberately **few** (1–4 cases per problem) — they check the key behavior,
the grader judges everything else.

## Interview tracks (`track`)

| id          | What it simulates | Agent the candidate gets |
|-------------|-------------------|--------------------------|
| `sprint`    | Large unfamiliar codebase, build a real feature in 30–60 min. | Strong model, full tools |
| `weak`      | Moderate codebase, older/smaller model that loses context and makes mistakes. Candidate must decompose and feed context. | Weak model, read_file truncated, few tool steps per turn |
| `precision` | Small, sharply scoped task. Agent runs in *literal mode*: does exactly what it is told, never infers. Candidate is scored on precision of the spec/narration. | Strong model, literal system prompt |
| `review`    | Code comprehension: find and fix bugs, explain behavior, optimize existing code (Google/Meta-style). | Strong model |

## Categories (`category`)
`fundamentals, comprehension, specs, debugging, features, delegation, refactoring, data-api,
performance, async, testing, security, integration` — see `src/lib/taxonomy.ts`.

## Layout

```
content/
  bases/<base-id>/            # a realistic codebase shared by several problems
    README.md                 # architecture overview, like a real repo README
    src/**.ts
    tests/**.test.ts          # visible tests — MUST all pass on the base
  problems/<slug>/
    problem.json
    prompt.md                 # the brief the candidate reads (markdown)
    rubric.md                 # grader-only: what great looks like, traps, follow-up seeds
    overlay/**                # files that replace/add to the base to form the starter (optional)
    hidden/*.test.ts          # hidden tests, mounted at tests/hidden/<name> — import "../../src/..."
    solution/**               # reference solution files, overlaid on the starter
```

`problem.json`:
```json
{
  "slug": "ledger-partial-refunds",          // must equal folder name; prefix with base id
  "title": "Partial refunds",
  "base": "ledger",
  "track": "sprint",
  "category": "features",
  "difficulty": "medium",                    // easy | medium | hard
  "timeLimit": 45,                           // 15 | 20 | 30 | 45 | 60
  "summary": "One sentence shown in the problem list.",
  "tags": ["money", "state-machine"],
  "remove": ["src/legacy/old.ts"],           // optional: base files deleted in the starter
  "starterPasses": false                     // optional, true only for no-code-change problems
}
```

## Runtime constraints (the sandbox)

Code runs in a browser Web Worker via a tiny CommonJS loader + sucrase (TS types stripped, no type-checking).

- **TypeScript only, zero dependencies.** Only relative imports, plus the virtual `testkit` module.
- **No Node or DOM APIs**: no `fs`, `path`, `process`, `Buffer`, `crypto`, `require` of built-ins. Plain ES2022 only
  (Map/Set/Promise/async/generators/classes/BigInt fine). Avoid decorators.
- `setTimeout`/`setInterval`/`queueMicrotask` exist, but each test has a **2 s timeout**. Prefer injected clocks
  (`now: () => number`) over real time. Make everything deterministic (seeded RNG if randomness is needed).
- Test API (`import { describe, it, test, expect, beforeEach, afterEach } from "testkit"`), jest-like:
  `toBe, toEqual, toStrictEqual, toMatchObject, toBeTruthy, toBeFalsy, toBeNull, toBeUndefined, toBeDefined,
  toBeNaN, toBeInstanceOf, toBeGreaterThan(OrEqual), toBeLessThan(OrEqual), toBeCloseTo, toContain,
  toContainEqual, toHaveLength, toHaveProperty, toMatch, toThrow(msg|RegExp|ErrorClass)`, `.not`,
  `await expect(p).resolves.X / .rejects.toThrow(...)`. No mocks/spies — write small fakes by hand.

## Quality bar

**Bases** should feel like a real company repo, not a toy: layered modules (domain / services / storage /
api or cli layer / utils), consistent conventions (e.g. money as integer cents, a `Result` type, an event bus,
error classes), some realistic cruft (a deprecated helper, a TODO, an outdated comment), and a README that
explains the architecture. Target **25–45 files and 2,000–3,500 lines** so that `sprint` problems genuinely
require navigation. Visible tests (`tests/`) should cover the main flows and all pass on the base.

**Problems** must be things a real AI-era interview would ask:
- `prompt.md` reads like an interviewer brief: context, the ask, acceptance criteria, constraints/non-goals.
  It must NOT tell the candidate which files to edit for sprint/weak/review problems (finding them is the test).
  Precision problems can be explicit about location; their difficulty is in specifying behavior exactly.
- Build in at least one **trap** an agent left unsupervised falls into: a second code path that also needs the
  change, a codebase convention (cents, immutability, event emission, cache invalidation), an edge case the
  prompt states once, a misleading comment, an existing helper that should be reused.
  The hidden tests should catch the trap.
- **Hidden tests: 1–4 `it` cases**, focused on the key behavior + the trap. Don't over-test.
  They must fail on the starter and pass with the solution. Test public behavior, not implementation details,
  so multiple valid designs pass. Where the prompt specifies a name/signature, tests may rely on it.
- `rubric.md` (grader-only) sections: `## Intended approach`, `## Key files`, `## Traps`,
  `## Strong signals`, `## Weak signals`, `## Follow-up questions` (3–5 probing questions an interviewer
  would ask afterwards, e.g. "How would this behave under concurrent refunds?").
- For `review` problems, use `overlay/` to inject realistic bugs or slow code into the base starter
  (the base itself stays correct). Visible tests may fail on such starters — that's fine.
- For `precision` problems, keep the change small (one function / one module) but make the spec
  exacting: ordering, tie-breaks, rounding, error messages, boundary inclusivity.
- `weak` problems: moderate scope (2–4 files touched), where a careless small model gets something
  subtly wrong unless the candidate feeds the right context.

## Verify

```
npx tsx scripts/verify-content.ts base:<base-id>    # all problems of a base
npx tsx scripts/verify-content.ts <slug> -v
```
Every problem must print `✓`. `content/problems/_example-clamp` is a minimal working example.
