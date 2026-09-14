import "server-only";
import { getAccess } from "./auth";
import { appBuild, buildAtLeast, getConfig } from "./config";
import { mexicoToday, parseSummaryRequest } from "./financial";

export const privateHeaders = { "Cache-Control": "private, no-store" };
// Every refusal names a stable code a client can act on without reading its
// message, whose wording stays free to change. Each code always travels with
// the same status, so the two can never disagree.
export const refusalStatus = {
  unauthenticated: 401,
  forbidden: 403,
  request_not_allowed: 403,
  not_found: 404,
  invalid_period: 400,
  invalid_field: 400,
  reconnect_required: 403,
  export_unconfirmed: 409,
  export_period_mismatch: 409,
  period_ended: 409,
  upgrade_required: 426,
  unavailable: 503,
  not_confirmed: 503,
} as const;
export type RefusalCode = keyof typeof refusalStatus;
export function jsonError(
  code: RefusalCode,
  message: string,
  detail: { field?: string | null; reconnect?: true } = {},
) {
  return Response.json(
    { error: message, code, ...detail },
    { status: refusalStatus[code], headers: privateHeaders },
  );
}
// An app build older than the server supports is asked to update before
// anything is read or written. A request naming no build, like the web's, and
// a server with no minimum are never affected; an unreadable build is old.
export function unsupportedBuild(request: Request) {
  const build = request.headers.get("x-finance-buddy-build");
  const minimum = getConfig()?.minimumIosBuild;
  if (build === null || !minimum) return null;
  const named = appBuild(build.trim());
  return named && buildAtLeast(named, minimum)
    ? null
    : jsonError("upgrade_required", "Update the app to keep using your journal.");
}
// Every private endpoint proves a live owner session, and a write proves where
// it came from before anything is read from its body. A present Origin must be
// this app's, however the request is authenticated. A write carrying the
// session cookie must name that Origin, since a browser attaches cookies to
// other sites' requests too; a bearer token is only ever attached by the client
// holding it, so a native write needs none. Every write carries JSON.
export async function authorizeOwner(request: Request, write: boolean) {
  const outdated = unsupportedBuild(request);
  if (outdated) return { denied: outdated };
  const access = await getAccess(request.headers);
  if (access.status !== "authorized")
    return { denied: jsonError(access.status, "Workspace access required.") };
  const origin = request.headers.get("origin");
  if (
    (origin !== null && origin !== getConfig()?.origin) ||
    (write &&
      ((origin === null && access.proof === "cookie") ||
        !request.headers.get("content-type")?.startsWith("application/json")))
  )
    return { denied: jsonError("request_not_allowed", "Request not allowed.") };
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
          "invalid_period",
          "Choose a day, week, or month with a valid date.",
        ),
      };
}
