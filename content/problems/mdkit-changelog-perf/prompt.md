# Slow changelog build

The docs build renders our `CHANGELOG.md` with `createProcessor().process(src)`. The file
has about a thousand releases. Each one has a `## vX.Y.Z` heading and the same
`### Fixed` / `### Added` sub-headings. Rendering it takes over 6 seconds. Pages a tenth
that size are instant, so cost grows much faster than input size.

## The ask

- Get a changelog of 1,000 releases (about 11k lines, 2,000 repeated `### Fixed` /
  `### Added` headings) under **300 ms** for `process()`.
- Output must be byte-for-byte identical. In particular, heading ids must not change,
  including the de-duplication rules (`fixed`, `fixed-1`, …). Watch the case where a
  heading's own text already looks like a de-duplicated id (e.g. `Fixed 1`).
- Explain what you found: where the time goes, and why it is super-linear.

## Notes

- Your agent is a smaller model with a short context window and limited tool steps. It
  will not find this by reading the whole codebase.
- Measure before you change anything. A quick timing harness in a test file is fine.
