# ngmicode

[![CI](https://github.com/mikeycantcode/ngmicode/actions/workflows/ci.yml/badge.svg)](https://github.com/mikeycantcode/ngmicode/actions/workflows/ci.yml)

**Free practice for AI-assisted coding interviews.** NeetCode, rebuilt for the rounds where you
steer a coding agent through a real codebase, under a clock, and then defend your work.

Built for everyone from students facing their first loop to staff engineers re-training for the
new format.

## The four formats

| Format | What it simulates | Agent |
|---|---|---|
| **Codebase Sprint** | Large unfamiliar repo, ship a feature in 30–60 min | Frontier model (`deepseek/deepseek-v4.1-flash`) |
| **Weak Agent** | Moderate repo, a small/older model with a short memory | `openai/gpt-5.6-luna`, last ~16 messages, 8 steps/turn |
| **Precision Spec** | Small task; graded on how precisely you specify behavior | Frontier model |
| **Debug & Review** | Read, debug and optimize existing code with an AI pair | Frontier model |

140 problems, easy → hard, on a NeetCode-style roadmap tree of 13 topics:

- **100 on original codebases**: 8 production-shaped TypeScript repos (ledger, job queue, e-commerce,
  markdown toolkit, KV store, team chat, ride dispatch, build orchestrator).
- **40 real-world PRs (SWE-bench style)** from hono, zod, yaml, immer, valibot, remeda, superstruct
  and ufo. The starter is the pinned repo with a merged PR reverted, the PR's tests are the hidden
  tests, and after you submit you can compare your fix with the maintainers'.

## How grading works

- **Few hidden tests by design** (1–4 per problem). They check the key behavior and the trap.
- An **AI grader** (`deepseek/deepseek-v4-pro`) reads your whole session: prompts, every agent tool
  call, test runs, notes, and the final diff. It scores 5 dimensions (decomposition, agent steering,
  verification, code quality, communication) weighted per format.
- An **AI interviewer** then asks 3–4 follow-up questions about your submission. Your answers
  adjust the score by up to ±10.
- Score = 35% hidden tests + 65% rubric. 70+ counts as solved.

## Architecture

```
Browser                                   Next.js server                      OpenRouter
┌───────────────────────────────┐        ┌─────────────────────────┐        ┌──────────┐
│ Monaco editor, file tree       │        │ /api/agent  (SSE proxy, │──────▶│ agent    │
│ Agent loop + tool execution ───┼──────▶│   per-format prompts,   │        │ models   │
│   (read/search/edit/run_tests) │        │   context trimming,     │        └──────────┘
│ Test runner in a Web Worker    │        │   daily token budget)   │        ┌──────────┐
│   (sucrase + tiny CJS loader)  │        │ /api/attempts/* submit, │──────▶│ grader / │
└───────────────────────────────┘        │   follow-up, finalize   │        │ interview│
                                          │ Postgres (users,        │        └──────────┘
                                          │   attempts, usage)      │
                                          └─────────────────────────┘
```

- Agent tools run **in the browser** against the in-memory workspace; the server only proxies the
  model call, so no user code ever executes on the server.
- Code runs in a sandboxed **Web Worker** (fresh worker per run, killed after 20 s).
- Auth is self-contained: email + password (bcrypt), JWT session cookie. No third-party auth.
- Tables are created automatically on first request.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET, OPENROUTER_API_KEY
npm run dev
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | 32+ random chars for session signing |
| `OPENROUTER_API_KEY` | Model access |
| `AGENT_MODEL_STRONG` / `AGENT_MODEL_WEAK` / `GRADER_MODEL` | Optional model overrides |
| `DAILY_TOKEN_LIMIT` | Per-user daily token budget (default 3,000,000) |

## Authoring problems

See [`content/AUTHORING.md`](content/AUTHORING.md). Each problem is a folder with a brief, a private
rubric, an optional overlay on a base codebase, hidden tests and a reference solution.

```bash
npm run content:verify                 # solution passes all tests; starter fails a hidden test
npm run content:verify -- base:ledger  # one codebase
npm run content:test-base -- ledger    # a base's visible tests
```

Note: this repo is public, so hidden tests and reference solutions are readable here. It is a
practice tool — peeking only costs you the practice.
