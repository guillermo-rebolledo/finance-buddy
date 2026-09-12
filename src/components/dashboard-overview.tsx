"use client";
import { money, signedMoney, type Summary, type Trend } from "@/lib/financial";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  PeriodNavigation,
  PeriodUnavailable,
  usePeriodView,
} from "@/components/period-view";
import { ReportExport } from "@/components/report-export";
import { SpendingTrends } from "@/components/spending-trends";

// The dashboard answers "how am I doing": the selected period's figures, the
// same period's spending groups, and how both moved across the periods leading
// up to it. Recording and correcting entries stays on the registry.
export function DashboardOverview({
  initial,
}: {
  initial: { summary: Summary | null; trend: Trend | null };
}) {
  const {
    summary,
    trend,
    view,
    anchor,
    loading,
    loadError,
    show,
    loaded,
    title,
    requestedLabel,
  } = usePeriodView(initial, true, "Your dashboard");
  return (
    <main aria-busy={loading} className="flex flex-col gap-8 pb-16 pt-8 md:pt-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="text-muted-foreground">
            {summary ? `${summary.start} – ${summary.end}` : "No period loaded"}
          </p>
          <p className="text-sm text-muted-foreground">Mexico City · MXN</p>
        </div>
        <ReportExport summary={summary} busy={loading} />
      </div>
      <PeriodNavigation
        view={view}
        anchor={anchor}
        loading={loading}
        loaded={loaded}
        onShow={show}
      />
      {loadError && (
        <PeriodUnavailable
          requestedLabel={requestedLabel}
          summary={summary}
          loading={loading}
          onRetry={() => show(view)}
        />
      )}
      {summary && (
        <>
          <section aria-label="Period totals" className="grid gap-4 md:grid-cols-3">
            {[
              ["Total income", money(summary.income)],
              ["Total expenses", money(summary.expenses)],
              ["Net change", signedMoney(summary.netChange)],
            ].map(([label, amount]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>
                    <span className="break-all text-2xl tabular-nums">
                      {amount}
                    </span>
                  </CardTitle>
                  {label === "Net change" && (
                    <CardDescription>
                      Recorded activity for this period
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            ))}
          </section>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Spending by category</h2>
              </CardTitle>
              <CardDescription>
                Expenses minus refunds recorded in this period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.breakdown.length ? (
                <ul className="flex flex-col gap-4">
                  {summary.breakdown.map((group) => (
                    <li
                      key={group.categoryId ?? "uncategorized"}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span className="break-words">{group.category}</span>
                      <span className="tabular-nums">{money(group.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No expenses or refunds in this period.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {trend && <SpendingTrends trend={trend} />}
    </main>
  );
}
