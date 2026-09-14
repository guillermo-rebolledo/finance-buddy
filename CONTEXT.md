# Personal Finance

Personal finance covers a person's income and expenses so they can understand how they spend their money.

## Language

**Financial movement**:
A recorded income, expense, or refund with an amount and a movement date. It may also have a category and a note.
_Avoid_: Movement (without qualification)

**Amount**:
The positive monetary value of a financial movement, expressed in Mexican pesos with at most two decimal places. The financial movement's type determines its effect on totals; refund amounts are entered as positive values.

**Movement date**:
The calendar date on which a financial movement occurred, which may differ from the date it was recorded.

**Note**:
Optional free text providing context for a financial movement.

**Expense**:
Money spent by a person, including credit-card purchases on their purchase date. Repaying the card does not count as another expense.

**Income**:
Money received by a person, excluding refunds and transfers between their own accounts.

**Refund**:
Money returned for an expense, reducing total expenses on the date the money is received rather than counting as income. The original purchase need not be recorded in the app; the refund uses the original expense's category when available, and categorization remains optional.

**Transfer**:
Money moved between a person's own accounts, including credit-card repayments. It is excluded from income and expense totals to avoid counting the same money twice.

**Currency**:
The monetary unit in which a financial movement's amount is expressed.

**Category**:
An optional classification describing the purpose or source of a financial movement. Income and expenses have separate category lists, and refunds use expense categories.

**Income category**:
A category describing the source of income.

**Category name**:
The current label identifying a category throughout the app, including on historical financial movements. Renaming a category updates that label without changing previously generated export snapshots.

**Expense category**:
A category describing the purpose of spending, also used to classify refunds of that spending.

**Starter category**:
A category provided in the initial category list. Income starts with Salary, Freelance, and Other income; expenses start with Groceries, Dining, Transport, Housing, Utilities, Health, Shopping, and Entertainment.

**Custom category**:
A category created by the person recording their financial movements to supplement the starter list.

**Archived category**:
A category temporarily unavailable for new financial movements, which can be restored for use again. Existing financial movements retain that category, and it remains represented in summaries and export snapshots containing those movements.

**Summary**:
A view of financial movements for a day, week, or month showing total income, total expenses, net change, spending by category, and the individual entries for that period. Financial movements belong to a summary according to their movement date.

**Summary period**:
A calendar day, a Monday-through-Sunday week, or a calendar month from its first through last day. Calendar boundaries and the current day are interpreted using Mexico City time (America/Mexico_City).

**Net change**:
Total recorded income minus total recorded expenses for a period. It describes recorded activity, not an account balance.

**Total expenses**:
The sum of recorded expenses minus refunds received within the summary period. A refund affects the period in which it is received, even when the original purchase occurred in an earlier period.

**Uncategorized**:
The reporting group for financial movements that have no category. Expenses in this group remain included in total expenses and spending breakdowns.

**Trend**:
How total income, total expenses, and net change moved across consecutive summary periods of one kind, together with spending by category across the whole stretch. A trend describes the same financial movements a summary does, grouped by the same calendar boundaries.

**Trend span**:
The consecutive summary periods a trend covers, ending with the selected summary period: fourteen days, twelve weeks, or twelve months. Each trend is presented beside the equally long span immediately before it, so a figure reads as rising or falling rather than as a bare amount.

**Budget**:
The most a person intends to spend during a summary period, measured against that period's total expenses, so refunds give room back and income never adds to it. A budget is either a repeating budget or a one-off budget. Days, weeks, and months are budgeted independently, even when they overlap.
_Avoid_: Spending limit

**Repeating budget**:
A budget that applies to every summary period of one kind, starting with the period it was set for, until it is changed or stopped. This is the default kind of budget.
_Avoid_: Recurring budget (recurring describes financial movements)

**One-off budget**:
A budget that applies only to the single summary period it was set for, such as the week of 14 September, and never repeats.

**Remaining budget**:
A budget minus its period's total expenses. It can exceed the budget when refunds received outweigh expenses, and nothing left over carries into another period.

**Over budget**:
The state of a budget whose period's total expenses exceed it, described by the amount of the excess rather than a negative remaining budget.

**Left per day**:
For the current week or month, the remaining budget divided by the days left in the period, counting today. It describes what remains available, not what should already have been spent, and is not a forecast.
_Avoid_: Daily allowance, safe to spend

**Financial report**:
A human-readable presentation of recorded income, expenses, and their summaries, intended for reading, printing, or sharing.

**Export snapshot**:
A copy of the selected day's, week's, or month's totals, category breakdown, and individual financial movements as they stood when exported, labeled with its export date. Later edits or deletions in the app do not change an existing snapshot.

**Export date**:
The date an export snapshot was generated, interpreted using Mexico City time. It is distinct from the summary period covered by the snapshot.
