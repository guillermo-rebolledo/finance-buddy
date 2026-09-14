import {
  authorizeOwner,
  jsonError,
  privateHeaders,
  requestedPeriod,
} from "@/lib/access";
import { exportAccess } from "@/lib/auth";
import { uuidPattern } from "@/lib/financial";
import {
  exportSnapshot,
  reconnectRefusal,
  type ExportRefusal,
} from "@/lib/sheets";
export const dynamic = "force-dynamic";

// Every refusal reads the same way, and says whether Google has to be
// authorized again before the owner tries once more.
function refuse(refused: ExportRefusal) {
  return jsonError(
    refused.code,
    refused.message,
    refused.code === "reconnect_required" ? { reconnect: true } : {},
  );
}

// Exporting is a write: it creates a spreadsheet in the owner's Google account
// from the owner's own period. The session supplies the owner, the request
// names the period the same way the report and the PDF export do, its body
// names only which export this is, and the provider token is minted here and
// never returned.
export async function POST(request: Request) {
  const access = await authorizeOwner(request, true);
  if ("denied" in access) return access.denied;
  const requested = requestedPeriod(request);
  if ("denied" in requested) return requested.denied;
  const granted = await exportAccess(request.headers);
  if (granted.status !== "authorized") return refuse(reconnectRefusal);
  try {
    const input = (await request.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    if (typeof input?.id !== "string" || !uuidPattern.test(input.id))
      return jsonError(
        "invalid_field",
        "We couldn't recognize that export. Reload the page and try again.",
        { field: "id" },
      );
    const result = await exportSnapshot(
      access.owner,
      input.id,
      requested.period,
      granted.accessToken,
    );
    if ("refused" in result) return refuse(result.refused);
    return Response.json(result, { headers: privateHeaders });
  } catch {
    return jsonError(
      "not_confirmed",
      "We couldn't finish the export. Your journal hasn't changed, so you can try the same export again.",
    );
  }
}
