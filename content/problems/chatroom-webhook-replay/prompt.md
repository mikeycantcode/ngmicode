# Webhook signatures v2 (CHAT-341)

A pentest found that our webhook signatures can be **replayed**. Anyone who
captures one signed request to `POST /hooks/:id`, for example from a proxy log,
can resend it forever and post into the channel as the bot. Our outgoing bot
deliveries have the same problem in reverse. Move **both directions** to a
timestamped v2 scheme. v1 is retired, with no grace period.

## v2 scheme

Every signed request carries two headers:

- `x-steer-timestamp`: Unix time in **seconds**, as a decimal integer string.
- `x-steer-signature`: `v2=` + `hmacHex(secret, "v2:" + timestamp + ":" + rawBody)`.

`hmacHex` and `timingSafeEqual` are in `src/util/hash.ts`.

## Incoming (`incomingWebhooks.receive`)

Check in this order. The first failure wins:

1. Unknown hook returns 404 `no_such_hook`, and a disabled hook returns 410 `hook_disabled`. These are unchanged.
2. Missing or malformed timestamp, missing signature, a v1 signature, or a signature mismatch returns **401 `invalid_signature`**. Compare signatures in constant time.
3. A timestamp more than `config.webhooks.signatureToleranceMs` (5 minutes) away from the server clock, in either direction, returns **401 `stale_request`**. Exactly 5 minutes is still accepted.
4. A signature already accepted for this hook within the tolerance window returns **409 `replayed`**.
5. Payload validation and posting continue as before.

A request that passes checks 2–4 counts as "seen" even if the payload is later
rejected. The replay memory must not grow without bound.

## Outgoing (bot event deliveries)

Sign every delivery attempt with v2, using the current clock at the time of
**that attempt**. A retry gets a fresh timestamp and signature.

## Done means

- Both directions use v2 only. Existing tests are updated to the new scheme.
- Tests cover stale, future, replay, and retry re-signing.
