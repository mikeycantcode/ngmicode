# Pin down the idempotency contract with tests

Idempotency keys are what stop a mobile client on a flaky network from charging
a customer twice. Last month someone deleted the idempotency tests during a
"flaky test purge". Since then, two odd support tickets came in:

- *"My app retried a payment after a timeout and got `409 … still in progress`.
  It kept getting 409 for the rest of the day."*
- *"Our Android and iOS SDKs send the same payment body, but a retry from the
  other SDK gets `422 idempotency_mismatch`."*

Nobody has confirmed whether these are bugs.

## The ask

1. Write a test suite at `tests/idempotency.test.ts`. It should cover **every
   clause** of the contract documented at the top of the idempotency service.
   Test at the service level, and at the API level where it adds value.
2. Use the tests to find out whether the tickets are real bugs. Fix any bugs
   the tests reveal. Keep the fix in the service, not in the callers.

## Acceptance criteria

- Your suite fails on the current code for each real bug, and passes after your fix.
- Each documented clause has at least one focused test with a clear name.
- The whole visible suite passes at the end.
- Tests are deterministic: no real timers. Use the injected clock.

You're working with an older, smaller model with limited context and a short
tool budget. Decompose the work.
