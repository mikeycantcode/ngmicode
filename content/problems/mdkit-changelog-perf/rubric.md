## Intended approach
Build a synthetic changelog generator and time `process()`. Then bisect by layer: time
`parseBlocks` alone, then rendering, then the anchors plugin. That isolates two independent
hotspots:
1. `src/block/lineReader.ts`: the reader keeps the container source as one string, and
   `peek()` calls `this.src.split("\n")` **on every call**. That is O(lines) per peek, so
   O(n²) over the document (the "memory" comment for mdkit#144 is the cover story). Fix:
   keep the `lines` array, so `peek` is O(1).
2. `src/render/slugger.ts`: `Slugger` stores used slugs in an array and probes `fixed-1`,
   `fixed-2`, … from 1 each time with `Array.includes`. For k duplicates that is O(k²)
   probes × O(k) per `includes`. Fix: a `Map`/`Set` of used slugs plus a per-base counter,
   **and** keep probing until the candidate is free, so `Fixed 1` style collisions still
   get unique ids.
Either fix alone still misses the budget (about 0.9 s or 5.6 s at this size).

## Key files
- `src/block/lineReader.ts` (`peek`, `next`)
- `src/render/slugger.ts` (`Slugger.slug`)
- `src/plugins/headingAnchors.ts`, `src/api/processor.ts` (callers, for orientation)

## Traps
- **Stopping after one hotspot.** Fixing the reader gives a 7× speedup and feels done. The
  slugger is still about 3× over budget. Hidden test 1 needs both.
- **Counter-only slugger.** `count[base]++` without checking for collisions hands out
  `fixed-1` twice when a heading is literally `Fixed 1`. Hidden test 2 pins the exact sequence.
- **Line numbers.** Rewriting `LineReader` carelessly breaks `position.line` (hidden test 1
  checks the last block's line).
- **Weak-agent sprawl.** Asking the small model to "optimize the parser" leads to random
  micro-optimizations. Measurement has to come from the candidate.

## Strong signals
- Measures first, with a size sweep (n, 2n, 4n) that shows quadratic or worse growth.
- Isolates layers by timing sub-steps, and hands the agent one small, precise change at a time.
- Gives the agent the exact de-dup semantics, with the `Fixed 1` example, before the slugger rewrite.
- Re-measures after each fix and reports the numbers.

## Weak signals
- Guesses at the cause, or lets the agent rewrite the block parser.
- Adds caching of whole rendered documents ("memoize process()") instead of fixing complexity.
- Changes slug output, or doesn't check it.

## Follow-up questions
- What was the complexity of each hotspot, and how did you confirm it empirically?
- The LineReader comment cites memory. Was that concern real? How would you measure it?
- How would you add a performance regression test that isn't flaky on slow CI machines?
- If a document had 100k unique headings, would your slugger still be fine? What about memory?
