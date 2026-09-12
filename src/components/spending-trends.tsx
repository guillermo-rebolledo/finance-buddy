"use client";
import {
  money,
  periodKindDetails,
  signedMoney,
  type Trend,
} from "@/lib/financial";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  CategoryBars,
  IncomeExpenseColumns,
  NetChangeColumns,
  TableView,
} from "@/components/charts";

// How the span reads in a sentence: "12 weeks", "14 days", "12 months".
function spanWords(trend: Trend) {
  return `${trend.length} ${periodKindDetails[trend.kind].label.toLowerCase()}s`;
}

export function SpendingTrends({ trend }: { trend: Trend }) {
  const span = spanWords(trend);
  // Every amount is a decimal string the server produced, so an untouched span
  // is exactly zero on both totals with no groups behind it.
  const recorded =
    trend.income !== "0.00" ||
    trend.expenses !== "0.00" ||
    trend.categories.length > 0;
  return (
    <section aria-label="Trends" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-2xl tracking-tight">
          The last {span}
        </h2>
        <p className="text-muted-foreground">
          {trend.start} – {trend.end}, ending with the period above. Each period
          uses the same Mexico City calendar boundaries as your summary.
        </p>
      </div>
      {!recorded ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing recorded in these {span}</EmptyTitle>
            <EmptyDescription>
              Record income, expenses, or refunds, or jump to a date with
              history behind it to see how spending moved.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Income and expenses</h3>
              </CardTitle>
              <CardDescription>
                Each period&apos;s recorded income beside its expenses after
                refunds. Across these {span}: income {money(trend.income)},
                expenses {money(trend.expenses)}, against{" "}
                {money(trend.previousIncome)} and{" "}
                {money(trend.previousExpenses)} in the {span} before.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IncomeExpenseColumns points={trend.points} />
              <TableView
                caption={`Income and expenses for each of the last ${span}`}
                headings={["Period", "Income", "Expenses"]}
                rows={trend.points.map((point) => [
                  point.label,
                  money(point.income),
                  money(point.expenses),
                ])}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Net change</h3>
              </CardTitle>
              <CardDescription>
                Recorded income minus expenses, period by period. Across these{" "}
                {span}: {signedMoney(trend.netChange)}. This describes recorded
                activity, not an account balance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NetChangeColumns points={trend.points} />
              <TableView
                caption={`Net change for each of the last ${span}`}
                headings={["Period", "Net change"]}
                rows={trend.points.map((point) => [
                  point.label,
                  signedMoney(point.netChange),
                ])}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Where the spending went</h3>
              </CardTitle>
              <CardDescription>
                Expenses minus refunds by category across the whole span, beside
                the same category in the {span} before it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trend.categories.length ? (
                <>
                  <CategoryBars
                    categories={trend.categories}
                    spanLabel={span}
                  />
                  <TableView
                    caption={`Spending by category across the last ${span}`}
                    headings={["Category", `Last ${span}`, `Previous ${span}`]}
                    rows={trend.categories.map((group) => [
                      group.category,
                      money(group.amount),
                      money(group.previous),
                    ])}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">
                  No expenses or refunds in these {span}.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
