import {
  authorizeOwner,
  jsonError,
  privateHeaders,
  requestedPeriod,
} from "@/lib/access";
import { trendReport } from "@/lib/trends";
export const dynamic = "force-dynamic";

// The dashboard's charts read the same period selection as its figures, and an
// unresolvable one is refused in the same words the summary refuses it in.
export async function GET(request: Request) {
  const access = await authorizeOwner(request, false);
  if ("denied" in access) return access.denied;
  const requested = requestedPeriod(request);
  if ("denied" in requested) return requested.denied;
  try {
    return Response.json(await trendReport(access.owner, requested.period), {
      headers: privateHeaders,
    });
  } catch {
    return jsonError("unavailable", "We couldn't load your trends. Try again.");
  }
}
