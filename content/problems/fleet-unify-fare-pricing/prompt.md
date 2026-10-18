# Retire legacy fare math (PRICE-212)

Finance reconciled last month's trips and found that the **upfront price** we show riders
often differs from what we **charge**, even on trips that go exactly as estimated (same
distance, same duration). The worst offenders are short trips during surge, where we
over-quote by 40% or more, and trips using percentage promos. Riders who see a higher upfront
price than their actual charge are dropping off. Riders who see a lower one file disputes.

The canonical fare computation is the one used at trip completion. It is the source of truth,
and **final fares must not change**. Upfront prices come from a deprecated module that has been
"temporarily" kept around since the monolith port.

## The ask

- Make every upfront price come from the same pricing logic as the final charge. A trip that
  goes exactly as estimated must be charged exactly what we quoted.
- Remove the deprecated fare implementation and anything that only it used.
- Final fares, payouts and the existing tests must stay exactly as they are.

## Non-goals

- Changing the ETA or distance estimation model.
- Changing any pricing rule.
