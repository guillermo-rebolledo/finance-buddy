import { authorizeOwner, jsonError, privateHeaders } from "@/lib/access";
import { exportAccess } from "@/lib/auth";
import {
  mexicoToday,
  parseSummaryRequest,
  uuidPattern,
} from "@/lib/financial";
import {
  exportSnapshot,
  reconnectRefusal,
  type ExportRefusal,
} from "@/lib/sheets";
export const dynamic = "force-dynamic";

// Every refusal reads the same way, and says whether Google has to be
// authorized again before the owner tries once more.
function refuse(refused: ExportRefusal) {
  return Response.json(
    refused.reconnect
      ? { error: refused.message, reconnect: true }
      : { error: refused.message },
    { status: refused.status, headers: privateHeaders },
  );
}

// Exporting is a write: it creates a spreadsheet in the owner's Google account
// from the owner's own period. The session supplies the owner, the request
// supplies only which period and which export, and the provider token is minted
// here and never returned.
export async function POST(request: Request) {
  const access = await authorizeOwner(request, true);
  if ("denied" in access) return access.denied;
  const granted = await exportAccess(request.headers);
  if (granted.status !== "authorized") return refuse(reconnectRefusal);
  try {
    const input = (await request.json().catch(() => null)) as {
      id?: unknown;
      kind?: unknown;
      date?: unknown;
    } | null;
    if (typeof input?.id !== "string" || !uuidPattern.test(input.id))
      return jsonError("Invalid export identifier. Reload and try again.", 400);
    const period = parseSummaryRequest(
      typeof input.kind === "string" ? input.kind : null,
      typeof input.date === "string" ? input.date : null,
      mexicoToday(),
    );
    if (!period)
      return jsonError("Choose a day, week, or month with a valid date.", 400);
    const result = await exportSnapshot(
      access.owner,
      input.id,
      period,
      granted.accessToken,
    );
    if ("refused" in result) return refuse(result.refused);
    return Response.json(result, { headers: privateHeaders });
  } catch {
    return jsonError(
      "The export could not be completed. Your journal is unchanged. Retry this same export.",
      503,
    );
  }
}
