## Intended approach
Add `signV2(secret, timestampSec, body)` and a verifier to `integrations/signing.ts`. In
`IncomingWebhookService.receive`, after the hook checks: parse `x-steer-timestamp` (`/^\d+$/`), compute the
expected v2 signature, and compare with `timingSafeEqual` → `invalid_signature`. Then check
`|clock.now() - ts*1000| > tolerance` → `stale_request`. Then check a per-hook replay cache (signature →
expiry) → `replayed`, record the signature, and prune expired entries. Then the existing payload/post logic.
In `OutgoingWebhookDispatcher.flush`, compute the timestamp from `clock.now()` per attempt and send both headers.
Update the visible tests that used `signV1`.

## Key files
- `src/integrations/signing.ts`, `src/integrations/incomingWebhooks.ts`, `src/integrations/outgoingWebhooks.ts`
- `src/util/hash.ts` (`hmacHex`, `timingSafeEqual`), `src/config.ts` (`webhooks.signatureToleranceMs`)
- `tests/integrations.test.ts` (uses v1 and must be updated)

## Traps
- **Units**: the header is seconds and the clock is milliseconds. A weak agent compares them directly, so everything is either stale or never stale.
- **Second code path**: outgoing deliveries also sign with v1. The prompt says "both directions" once. Retries must re-sign with a fresh timestamp, not reuse the body's `sentAt` or the first attempt's signature.
- **Check order**: an invalid signature must not be reported as `stale_request` or `replayed`, which would make the endpoint an oracle. Only verified requests enter the replay cache, so an attacker can't poison it with forged signatures.
- **Boundary**: exactly 5 minutes is accepted (`>`, not `>=`), in both past and future.
- **Unbounded replay cache**: entries must expire once the timestamp would be stale anyway.
- Using `===` for signature comparison. That's not caught by tests, but should be flagged.
- Keeping v1 as a fallback, which the prompt forbids. A hidden test sends a valid v1 signature.

## Strong signals
- Spells out the check order and the units to the weak agent explicitly. Feeds it `hash.ts`, `signing.ts` and the receive function together.
- Finds the outgoing path proactively (search for `signV1` / `SIGNATURE_HEADER`).
- Explains why the replay window equals the tolerance window, and why the replay key is the signature and not the body.
- Writes tests with `ManualClock` for the boundary cases.

## Weak signals
- Lets the agent bolt a timestamp check onto v1, or accept either version.
- Doesn't test the outgoing side. Doesn't notice the existing tests now fail.

## Follow-up questions
- With several server instances, where does the replay cache live? What happens if it's unavailable?
- How would you support secret rotation without downtime under v2?
- Why include the timestamp *inside* the signed string rather than just checking the header?
- An attacker can't forge signatures but can delay a captured request by 4 minutes. What can they still do, and does it matter?
