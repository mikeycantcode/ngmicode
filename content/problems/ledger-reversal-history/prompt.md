# Why did last month's books change?

Finance closed **January** and sent the trial balance to the auditors.
On **February 10**, an ops engineer found a duplicate customer top-up that was
posted on **January 20**. They reversed it with
`POST /journal/entries/:id/reverse`.

Finance then re-ran January's trial balance (`asOf = Jan 31`) and the wallet
balances were different from what the auditors have. They also say the
February statement for that customer "doesn't show the correction at all".

## The ask

1. Work out how time works in this ledger: `postedAt` vs `createdAt`, `asOf`,
   statements, reversals. Then explain to us **why** January changed. Put the
   explanation in your final message in the chat; we'll discuss it.
2. Fix the ledger so that correcting a mistake can **never** change any balance
   as of a past time. A reversal must show up in the period it was made.

## Acceptance criteria

- Reversing an entry today leaves every balance and trial balance `asOf` a time
  before the reversal exactly as it was.
- After the reversal, the current balance nets the entry out.
- The statement for the period that contains the reversal shows it as its own line.
- Existing behavior stays the same: you can reverse an entry only once, and a
  reversal cannot be reversed.

## Notes

The existing code comments may not be trustworthy. Check the README.
