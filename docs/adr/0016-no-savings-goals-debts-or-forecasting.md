---
status: accepted
---

# Leave savings goals, debts and forecasting out of scope

Several reference apps go beyond recording spending:

- Money Lover has savings goals and tracks debts and loans.
- Firefly III has "piggy banks" for savings.
- Cashew records money borrowed and lent.
- YNAB has targets and a loan planner.
- Wallet and Bluecoins project future cash flow.

Finance Buddy builds none of these.

Each one needs something the journal deliberately lacks. The journal records activity: net change is recorded income minus recorded expenses for a period, not an account balance, and ADR 0010 keeps the journal account-less. A savings goal measures progress of money set aside somewhere, a debt tracks an amount owed and paid down, and a cash-flow forecast projects a balance forward. Built on net change instead, each would show a figure that looks like money in hand without being it. These features depend on ADR 0010 being reversed, and should be reconsidered only once accounts and opening balances exist.

## Consequences

- **Lending and borrowing.** Money lent or borrowed gets no dedicated kind. Whether and how the owner records it stays their choice under the current definitions of income and expense. Repaying a credit card remains an unrecorded transfer.
- **Forward-looking views.** These stay about spending, not balances. The trend compares recorded periods, and the separately specified pace-of-spending indicator compares spending with elapsed time; neither projects a balance. Budgets, recorded on main as "Budget total expenses per period, repeating by default with one-off overrides", are the recommended way to plan spending.
- **Recurring or planned entries.** If adopted, they remain a capture convenience. A planned entry stays out of totals until confirmed and does not become a forecast.
- **Unaffected.** Totals, refund arithmetic, archived categories, export snapshots, owner-only access and idempotent entry ids do not change.
