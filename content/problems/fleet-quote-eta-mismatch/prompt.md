# "2 minutes away", then 9

Support escalated a pile of tickets like this one:

> The app said my car was **2 minutes away**. I pressed Confirm and got a driver who was
> **9 minutes away**. This happens constantly downtown at rush hour.

Product's position: the ETA on the confirm screen (the quote's `pickupEtaSec`) must be **exactly
the ETA that dispatch would assign if the rider pressed Confirm right now**. It must use the
same drivers, the same ETA model and the same rounding. If dispatch would find nobody, the quote
shows no ETA (`null`).

## The ask

1. **Explain first.** Before changing code, tell your interviewer in plain words every reason
   the two numbers can disagree today. Point to the code for each reason.
2. Then fix it so that they agree.

## Constraints

- Dispatch is the source of truth. Don't change how dispatch picks drivers or computes ETAs.
- Keep the change small. This is a consistency fix, not a redesign.
- The price part of the quote is out of scope.
