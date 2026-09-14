import {
  authorizeOwner,
  jsonError,
  privateHeaders,
  requestedPeriod,
} from "@/lib/access";
import { entryBudget } from "@/lib/budgets";
import {
  entryKindDetails,
  mexicoToday,
  validateEntry,
  validateEntryTarget,
  type EntryError,
  type EntryInput,
  type EntryKind,
} from "@/lib/financial";
import { deleteEntry, editEntry, saveEntry, summarize } from "@/lib/journal";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeOwner(request, false);
  if ("denied" in access) return access.denied;
  const requested = requestedPeriod(request);
  if ("denied" in requested) return requested.denied;
  try {
    return Response.json(await summarize(access.owner, requested.period), {
      headers: privateHeaders,
    });
  } catch {
    return jsonError("unavailable", "We couldn't load this period. Try again.");
  }
}
// Recording, correcting and deleting share the same session, request integrity,
// body parsing and field-error reporting. Only the rules and the statement
// differ, and an unconfirmed write says so instead of claiming success.
async function change(
  request: Request,
  unconfirmed: string,
  apply: (
    owner: string,
    input: unknown,
    today: string,
  ) => Promise<EntryError | null | undefined>,
  confirmed: (owner: string, input: unknown) => Promise<object> = async () => ({}),
) {
  const access = await authorizeOwner(request, true);
  if ("denied" in access) return access.denied;
  try {
    const input = await request.json().catch(() => null);
    const refused = await apply(access.owner, input, mexicoToday());
    if (refused)
      return jsonError("invalid_field", refused.message, {
        field: refused.field,
      });
    return Response.json(
      { saved: true, ...(await confirmed(access.owner, input)) },
      { headers: privateHeaders },
    );
  } catch {
    return jsonError("not_confirmed", unconfirmed);
  }
}
// An expense or refund counts against a budget, so its reply adds the budget
// of the shortest period containing the saved movement date, read after the
// write commits. The entry is saved either way, so a budget that cannot be
// read is left out rather than turning the save into an unconfirmed one.
async function budgetReply(owner: string, input: unknown) {
  const { kind, date } = input as EntryInput;
  if (entryKindDetails[kind as EntryKind].total !== "expenses") return {};
  const budget = await entryBudget(owner, date).catch(() => null);
  return budget ? { budget } : {};
}
export function POST(request: Request) {
  return change(
    request,
    "We didn't get confirmation that this entry was saved. Retry the same entry to avoid a duplicate.",
    async (owner, input, today) =>
      validateEntry(input, today) ??
      (await saveEntry(owner, input as EntryInput)),
    budgetReply,
  );
}
export function PATCH(request: Request) {
  return change(
    request,
    "We didn't get confirmation that your changes were saved. It's safe to retry with the same values.",
    async (owner, input, today) =>
      validateEntry(input, today) ??
      (await editEntry(owner, input as EntryInput)),
    budgetReply,
  );
}
export function DELETE(request: Request) {
  return change(
    request,
    "We couldn't confirm that this entry was deleted. Try deleting it again.",
    async (owner, input) =>
      validateEntryTarget(input) ??
      (await deleteEntry(owner, (input as EntryInput).id)),
  );
}
