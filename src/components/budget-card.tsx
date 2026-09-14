import Link from "next/link";
import { periodKindDetails, type Summary } from "@/lib/financial";
import { BudgetFigures } from "@/components/budget-figures";
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
// Budgets page, which this card links to, so the dashboard only reports. A
// period that has ended says whether it ended under or over its budget.
export function BudgetCard({ summary }: { summary: Summary }) {
  const { budget } = summary;
  const noun = periodKindDetails[summary.kind].label.toLowerCase();
  const ended = summary.end < summary.today;
  return (
    <section aria-label="Budget">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Budget</h2>
          </CardTitle>
          <CardDescription>
            {budget
              ? `${budget.repeats ? "Repeating" : "One-off"} budget.${
                  ended
                    ? ` This ${noun} ended ${budget.overBudget ? "over" : "under"} budget.`
                    : ""
                }`
              : `No budget for this ${noun}.`}
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
              <BudgetFigures budget={budget} today={summary.today} />
            </div>
          </CardContent>
        )}
      </Card>
    </section>
  );
}
