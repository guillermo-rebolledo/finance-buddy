import {
  authorizeOwner,
  jsonError,
  privateHeaders,
  requestedPeriod,
} from "@/lib/access";
import { setRepeatingBudget } from "@/lib/budgets";
import { centavos, validateBudget, type BudgetInput } from "@/lib/financial";
export const dynamic = "force-dynamic";

// A budget names its period exactly as a summary does, so a client never
// computes a period start. The reply is the budget that now applies to that
// period, and repeating the same request changes nothing further.
export async function PUT(request: Request) {
  const access = await authorizeOwner(request, true);
  if ("denied" in access) return access.denied;
  const requested = requestedPeriod(request);
  if ("denied" in requested) return requested.denied;
  try {
    const input = await request.json().catch(() => null);
    const refused = validateBudget(input);
    if (refused)
      return jsonError("invalid_field", refused.message, {
        field: refused.field,
      });
    const budget = await setRepeatingBudget(
      access.owner,
      requested.period,
      centavos((input as BudgetInput).amount),
    );
    return Response.json({ saved: true, budget }, { headers: privateHeaders });
  } catch {
    return jsonError(
      "not_confirmed",
      "The budget could not be confirmed. Retry it safely.",
    );
  }
}
