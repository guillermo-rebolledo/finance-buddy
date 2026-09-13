---
status: accepted
---

# Set monthly spending limits per expense category, without envelopes

Nearly every reference app offers budgets, and they come in two families:

- **Spending limits per category and period**: Bluecoins, Wallet, Cashew, Money Manager and Vuallet.
- **Envelope or zero-based budgeting**, which assigns money before it is spent: Actual, YNAB and Goodbudget.

Finance Buddy takes the first family. The owner may set a **spending limit** for an expense category per summary period kind, starting with calendar months. The dashboard then shows each limited category's spending against its limit for the selected period.

Spending is measured exactly as total expenses already are. A category's spending is its expenses minus the refunds received in that period. A refund therefore lowers the period in which it arrives, even when the purchase was earlier, and a category can end a period below zero without being clamped. An optional limit on total expenses for the period also covers Uncategorized spending, which no category limit can reach.

A first version has no envelope budgeting, which needs accounts and balances that the journal deliberately lacks (ADR 0010). It also has no rollover: carry-over, as in Bluecoins and Toshl, would make one month's figure depend on every earlier month.

The separately specified pace-of-spending indicator deliberately works without budgets, comparing spending with how much of the period has elapsed.

## Considered options

- **Weekly and daily limits:** weekly limits can follow with the same rule. Daily limits are too noisy for irregular spending such as rent.
- **Budgets filtered by tag or account (Toshl):** Finance Buddy has neither.

## Consequences

- **Limit history.** A limit takes effect from a given month, so past periods keep showing the limit that applied at the time.
- **Currency.** Limits are expressed in the preferred currency (ADR 0007). The spec must decide what happens when that preference changes: re-express the limits, or ask the owner to set them again.
- **Archived categories.** An archived category keeps its limit on past periods, and the limit returns if the category is restored (ADR 0004). No new spending can reach an archived category, so its limit is hidden from periods where it has no spending.
- **Transfers and refunds.** Transfers are not recorded, so they never count against a limit. Refund arithmetic and totals are unchanged.
- **Access and idempotency.** Limits are scoped to the owner, like categories. Setting a limit is an idempotent replacement per category, period kind and effective month, independent of entry ids.
- **Export snapshots.** They are unchanged in a first version. If they later include budget versus actual, a snapshot keeps the limits as they stood when it was exported.
