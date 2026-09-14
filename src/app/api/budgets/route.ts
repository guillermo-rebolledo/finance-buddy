import {
  authorizeOwner,
  jsonError,
  privateHeaders,
  requestedPeriod,
} from "@/lib/access";
import {
  listBudgets,
  type BudgetChange,
  removeOneOffBudget,
  setOneOffBudget,
  setRepeatingBudget,
  stopRepeatingBudget,
} from "@/lib/budgets";
import {
  centavos,
  parsePastCursor,
  validateBudget,
  validateBudgetRemoval,
  type BudgetInput,
  type BudgetRemoval,
  type SummaryRequest,
} from "@/lib/financial";
export const dynamic = "force-dynamic";

// The Budgets page reads everything it lists from here, resolved against the
// server's today, so no client decides which periods are current. `before`
// continues Past after the cursor the previous page ended with.
export async function GET(request: Request) {
  const access = await authorizeOwner(request, false);
  if ("denied" in access) return access.denied;
  const before = new URL(request.url).searchParams.get("before");
  const cursor = before === null ? null : parsePastCursor(before);
  if (before !== null && !cursor)
    return jsonError(
      "invalid_field",
      "Show more past budgets from the list you already have.",
      { field: "before" },
    );
  try {
    return Response.json(await listBudgets(access.owner, cursor), {
      headers: privateHeaders,
    });
  } catch {
    return jsonError("unavailable", "Could not load your budgets. Please retry.");
  }
}

// A budget names its period exactly as a summary does, so a client never
// computes a period start. A period that has ended keeps its budget, so only a
// current or future one can change, as judged when the change runs. The reply is the budget that now applies
// to that period, and repeating the same request changes nothing further.
async function change(
  request: Request,
  validate: (input: unknown) => { field: string | null; message: string } | null,
  apply: (
    owner: string,
    period: SummaryRequest,
    input: unknown,
  ) => Promise<BudgetChange>,
) {
  const access = await authorizeOwner(request, true);
  if ("denied" in access) return access.denied;
  const requested = requestedPeriod(request);
  if ("denied" in requested) return requested.denied;
  try {
    const input = await request.json().catch(() => null);
    const refused = validate(input);
    if (refused)
      return jsonError("invalid_field", refused.message, {
        field: refused.field,
      });
    const change = await apply(access.owner, requested.period, input);
    if (change.ended)
      return jsonError(
        "period_ended",
        "This period has ended, so its budget stays as it was.",
      );
    return Response.json(
      { saved: true, budget: change.budget },
      { headers: privateHeaders },
    );
  } catch {
    return jsonError(
      "not_confirmed",
      "The budget could not be confirmed. Retry it safely.",
    );
  }
}
export function PUT(request: Request) {
  return change(request, validateBudget, (owner, period, input) => {
    const { amount, oneOff } = input as BudgetInput;
    return (oneOff ? setOneOffBudget : setRepeatingBudget)(
      owner,
      period,
      centavos(amount),
    );
  });
}
export function DELETE(request: Request) {
  return change(request, validateBudgetRemoval, (owner, period, input) =>
    ((input as BudgetRemoval).scope === "period"
      ? removeOneOffBudget
      : stopRepeatingBudget)(owner, period),
  );
}
