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
          Past {span}
        </h2>
        <p className="text-muted-foreground">
          {trend.start} – {trend.end}. This range ends with the period above,
          using Mexico City dates throughout.
        </p>
      </div>
      {!recorded ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No activity in the past {span}</EmptyTitle>
            <EmptyDescription>
              Add a few entries, or jump to an earlier date, to see how your
              money has moved over time.
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
                Compare each period&apos;s income with spending after refunds. In
                these {span}, you recorded {money(trend.income)} in income and{" "}
                {money(trend.expenses)} in expenses. The previous {span} came
                to {money(trend.previousIncome)} and{" "}
                {money(trend.previousExpenses)}.
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
                Income minus expenses, period by period. The total change for
                these {span} is {signedMoney(trend.netChange)}. It&apos;s your
                recorded activity, not an account balance.
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
                See what you spent in each category, after refunds, compared
                with the previous {span}.
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
                  No spending or refunds in these {span}.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
