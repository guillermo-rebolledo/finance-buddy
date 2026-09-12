import "server-only";
import { getAccess } from "./auth";
import { getConfig } from "./config";
import { mexicoToday, parseSummaryRequest } from "./financial";

export const privateHeaders = { "Cache-Control": "private, no-store" };
export function jsonError(
  message: string,
  status: number,
  field?: string | null,
) {
  return Response.json(
    field === undefined ? { error: message } : { error: message, field },
    { status, headers: privateHeaders },
  );
}
// Every private endpoint proves a live owner session; a write additionally
// proves a same-origin JSON request before anything is read from its body.
export async function authorizeOwner(request: Request, write: boolean) {
  const access = await getAccess(request.headers);
  if (access.status !== "authorized")
    return {
      denied: jsonError(
        "Workspace access required.",
        access.status === "unavailable"
          ? 503
          : access.status === "forbidden"
            ? 403
            : 401,
      ),
    };
  if (
    write &&
    (request.headers.get("origin") !== getConfig()?.origin ||
      !request.headers.get("content-type")?.startsWith("application/json"))
  )
    return { denied: jsonError("Request not allowed.", 403) };
  return { owner: access.userId };
}
// The report and its export resolve the requested period the same way, and
// refuse an unresolvable one in the same words, so a file can only ever cover a
// period the overview itself can show.
export function requestedPeriod(request: Request) {
  const url = new URL(request.url);
  const period = parseSummaryRequest(
    url.searchParams.get("kind"),
    url.searchParams.get("date"),
    mexicoToday(),
  );
  return period
    ? { period }
    : {
        denied: jsonError(
          "Choose a day, week, or month with a valid date.",
          400,
        ),
      };
}
