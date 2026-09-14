import Link from "next/link";
import {
  budgetStanding,
  money,
  periodKindDetails,
  type Summary,
} from "@/lib/financial";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// The selected period's budget, read-only: budgets are set and changed on the
// Budgets page, which this card links to, so the dashboard only reports.
export function BudgetCard({ summary }: { summary: Summary }) {
  const { budget } = summary;
  const noun = periodKindDetails[summary.kind].label.toLowerCase();
  return (
    <section aria-label="Budget">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Budget</h2>
          </CardTitle>
          <CardDescription>
            {budget ? `Repeats every ${noun}.` : `No budget for this ${noun}.`}
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link href="/budgets">Budgets</Link>
            </Button>
          </CardAction>
        </CardHeader>
        {budget && (
          <CardContent>
            <div className="flex flex-col gap-4">
              <p
                className={cn(
                  "break-all text-2xl font-semibold tabular-nums",
                  budget.overBudget && "text-destructive",
                )}
              >
                {budgetStanding(budget)}
              </p>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  ["Budget", budget.amount],
                  ["Total expenses", budget.expenses],
                ].map(([label, amount]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="break-all tabular-nums">{money(amount)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </CardContent>
        )}
      </Card>
    </section>
  );
}
