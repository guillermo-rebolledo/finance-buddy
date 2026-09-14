# Budget total expenses per period, repeating by default with one-off overrides

A person may set a **budget** for days, weeks, or months: the most they intend to spend in a summary period. It is measured against the period's total expenses using summary arithmetic: expenses minus refunds received in the period, uncategorized spending included, nothing clamped. Income never adds to a budget, and nothing left over or overspent carries into another period.

A budget repeats by default: MXN 2,000 set for the week of 14 September applies to every following week until it is changed or stopped. Ticking **One-off** instead makes it apply to that single period. A one-off budget takes precedence over the repeating budget for its period only, so a trip week can have its own figure and the repeating budget resumes the week after. A period therefore has at most one budget of its kind, and days, weeks, and months are budgeted independently even when they overlap.

This supersedes the unmerged draft "Set monthly spending limits per expense category, without envelopes" on the `docs/reference-apps-adrs-and-specs` branch.

## Considered options

- **One-off budgets only:** briefly chosen so every period's intention would be set on purpose, then rejected because re-entering the same weekly figure is tedious and most people's budgets stay the same.
- **Limits per expense category:** left for later. A total budget answers "how much can I still spend?" directly and also covers Uncategorized spending, which no category limit reaches.
- **Rollover of unspent or overspent amounts:** rejected, because it would make one period's figure depend on every earlier period.
- **Envelope or zero-based budgeting:** rejected, because it needs accounts and balances that the journal does not have.
- **Generating a budget row per period, or a scheduled job:** rejected. A repeating budget is stored as a span of periods and the budget for any period is resolved when read, so nothing can be missed or duplicated.

## Consequences

- **History.** Changing or stopping a repeating budget takes effect from the period it is changed in, including the current one. Ended periods keep the amount that applied to them and are read-only, still showing whether they ended under or over.
- **Scheduled changes.** A repeating budget may be set to change from a future period. A change made earlier applies only until the next scheduled change, which survives. Stopping ends the repeating budget and every scheduled change from that period on.
- **No skipped periods.** A period covered by a repeating budget cannot be marked as having no budget in the first version; a larger one-off budget serves instead.
- **Whole periods.** A budget always covers its entire period, including spending recorded before it was set, so it reconciles with the summary.
- **Left per day.** For the current week or month, the remaining budget divided by the days left, today included, is shown as what is left per day. It is never presented as what should already have been spent, and it is not a forecast.
- **Currency and calendar.** Budgets follow the single-currency and Mexico City calendar rules (ADR 0001). Each budget records its currency so a later multi-currency change can reinterpret it without rewriting stored budgets.
- **Export snapshots** are unchanged in the first version.
