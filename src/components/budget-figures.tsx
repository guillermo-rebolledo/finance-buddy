import {
  budgetPace,
  budgetStanding,
  money,
  type BudgetView,
} from "@/lib/financial";
import { cn } from "@/lib/utils";

// One budget's figures, the same wherever a budget is shown: what is left or
// how far over, left per day where it applies, then the budget and the total
// expenses it is measured against.
export function BudgetFigures({ budget }: { budget: BudgetView }) {
  const pace = budgetPace(budget);
  return (
    <>
      <p
        className={cn(
          "break-all text-2xl font-semibold tabular-nums",
          budget.overBudget && "text-destructive",
        )}
      >
        {budgetStanding(budget)}
      </p>
      {pace && (
        <div className="flex flex-col gap-0.5">
          <p className="break-all font-medium tabular-nums">{pace.amount}</p>
          <p className="text-sm text-muted-foreground">{pace.days}</p>
        </div>
      )}
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
    </>
  );
}
