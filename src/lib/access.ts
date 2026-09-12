import "server-only";
import { getAccess } from "./auth";
import { getConfig } from "./config";

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
