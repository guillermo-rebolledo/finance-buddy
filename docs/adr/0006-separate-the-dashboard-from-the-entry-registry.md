# Separate the dashboard from the entry registry

Split the single signed-in overview into two pages. The home page is the **registry**: it selects a summary period and lists that period's financial movements compactly, with recording, correcting and deleting. A new `/dashboard` page carries everything that summarizes those movements: the period's total income, total expenses and net change, its spending by category, and trend charts across the periods leading up to it.

The two pages select a period the same way, from the same controls, and land on the same current week. A person reading their figures and a person recording a movement were previously scrolling past each other's work on one long page; separating them keeps each page short enough to read, and leaves room for charts that a combined page had no space for.

## Where exports live

Both snapshot exports, PDF and Google Sheets, move to the dashboard. An export carries the selected period's totals, category breakdown and movements, so it belongs beside the figures it reproduces rather than beside the list of rows. The Google authorization callback therefore returns to `/dashboard`.

## What the trends cover

A trend ends with the selected summary period and reaches back over fourteen days, twelve weeks or twelve months, matching the selected period kind. Movements are placed into periods by the same Mexico City calendar boundaries a summary uses, so a figure on the dashboard always reconciles with the summary for that period, and a refund reduces expenses in the period it was received.

Each trend is read beside the equally long span immediately before it. Both spans come from one statement, so the comparison can never be drawn between two different snapshots of the journal.

Spending is grouped by category across the whole span; income is not. Income sources answer a different question and would double the bars without comparing anything. Past six spending groups the remainder folds into one **Other categories** group that keeps its figures, so the groups still reconcile with the span's total expenses rather than silently dropping the tail.

## Charts

Charts are drawn as plain elements sized by percentage rather than through a charting dependency, keeping the runtime dependency list as it was. Colour carries series identity only, never magnitude: income and expenses take a categorical pair, and net change takes a diverging pair around a zero line placed where the data actually crosses it. Every chart ships with a table of the same figures and marks that name their own period and amount, so no value is reachable only by pointing at it.
