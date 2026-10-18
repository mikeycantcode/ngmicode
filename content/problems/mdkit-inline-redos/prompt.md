# Fuzzer found slow inputs

We render user comments with mdkit on the request path. A fuzzing run flagged three
input shapes that pin a CPU core for seconds. Each one is a denial-of-service vector.

1. A paragraph line with a very long run of spaces in the middle, followed by a newline:
   `"a" + " ".repeat(40000) + "b\n..."`.
2. Tens of thousands of emphasis characters that can only *close*, never open:
   `"a* ".repeat(40000)`.
3. A link reference definition with long space runs:
   `"[a]:" + " ".repeat(20000) + "/url" + " ".repeat(20000) + "x"`.

## The ask

- Make all three shapes render in well under 400 ms each, at the sizes above.
- Output must not change for any normal input. Hard breaks, emphasis nesting (including
  CommonMark's "rule of 3") and reference definitions must behave exactly as before.
- Explain the root cause of each one: why it is slow and what the complexity was
  before and after.

## Constraints

- No input-length caps, truncation, or timeouts. Fix the algorithms.
- Keep the fixes minimal and local. This goes out as a security patch.
