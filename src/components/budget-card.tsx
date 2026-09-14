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
          <CardContent className="flex flex-col gap-4">
            <BudgetFigures budget={budget} />
          </CardContent>
        )}
      </Card>
    </section>
  );
}
