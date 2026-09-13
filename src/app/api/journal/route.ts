import {
  authorizeOwner,
  jsonError,
  privateHeaders,
  requestedPeriod,
} from "@/lib/access";
import {
  mexicoToday,
  validateEntry,
  validateEntryTarget,
  type EntryError,
  type EntryInput,
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
    return jsonError("unavailable", "Could not load this period. Please retry.");
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
    return Response.json({ saved: true }, { headers: privateHeaders });
  } catch {
    return jsonError("not_confirmed", unconfirmed);
  }
}
export function POST(request: Request) {
  return change(
    request,
    "Save could not be confirmed. Retry this entry safely.",
    async (owner, input, today) =>
      validateEntry(input, today) ??
      (await saveEntry(owner, input as EntryInput)),
  );
}
export function PATCH(request: Request) {
  return change(
    request,
    "The correction could not be confirmed. Retry it safely.",
    async (owner, input, today) =>
      validateEntry(input, today) ??
      (await editEntry(owner, input as EntryInput)),
  );
}
export function DELETE(request: Request) {
  return change(
    request,
    "The deletion could not be confirmed. Retry it safely.",
    async (owner, input) =>
      validateEntryTarget(input) ??
      (await deleteEntry(owner, (input as EntryInput).id)),
  );
}
