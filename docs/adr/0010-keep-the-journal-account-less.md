---
status: accepted
---

# Keep the journal account-less and leave transfers unrecorded

Account-based apps record which account every transaction touched, and in return they offer balances, reconciliation against statements, and tracking of credit-card repayments. Finance Buddy records financial movements without accounts, and it stays that way. A transfer between the owner's own accounts, including a credit-card repayment, is simply not recorded, which already keeps it out of income and expense totals as CONTEXT.md defines. A credit-card purchase is an expense on its purchase date.

The journal answers what was earned and spent in a period, and every entry has one field fewer, which keeps capture on a phone quick. With accounts, every entry would have to name one and every transfer would have to be recorded to keep balances true. Each balance would also need an opening figure and regular reconciliation before anyone could trust it. Bluecoins and Firefly III record transfers as a separate type, and Actual leaves on-budget transfers uncategorized. Both reach the totals that Finance Buddy gets by not recording transfers at all.

## What is given up

- Account balances, reconciliation and net worth.
- Tracking what is owed on a card and when it was paid.

Net change remains recorded activity, not a balance. Per-currency cash wallets, already out of scope in ADR 0007, stay excluded. Savings goals and debts (ADR 0016) depend on this decision being reversed.

## If accounts are ever added

- **Transfers.** A transfer becomes its own kind of financial movement between two accounts and is excluded from income and expense totals, as in Bluecoins and Firefly III. It should not be a pair of opposite entries that need linking. One movement keeps one idempotent entry id.
- **Existing movements.** Every one needs an account. A backfill would place them in a single unassigned account with no opening balance, so early balances would mean little.
- **Refunds.** They keep reducing total expenses in the period received. A refund to a card also becomes money coming into that account.
- **Currencies.** A transfer between accounts in different currencies needs ADR 0007's conversion rules on both sides.
- **Export snapshots.** They would add an account to each movement, and possibly balances, frozen at export like everything else.
- **Account lifecycle.** Accounts would be scoped to the owner and archived rather than deleted, like categories (ADR 0004).
