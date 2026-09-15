import { authorizeOwner, jsonError, privateHeaders } from "@/lib/access";
import { deleteUserIdentity } from "@/lib/account-deletion";

export async function DELETE(request: Request) {
  const access = await authorizeOwner(request, true, { optionalBody: true });
  if ("denied" in access) return access.denied;
  try {
    const body = await request.text();
    if (
      body &&
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      return jsonError(
        "request_not_allowed",
        "Finance Buddy blocked this request.",
      );
    let input;
    try {
      input = body ? JSON.parse(body) : {};
    } catch {
      input = null;
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      return jsonError(
        "invalid_field",
        "Send a JSON object or omit the body.",
        { field: null },
      );
    if (
      input.appleAuthorizationCode !== undefined &&
      (typeof input.appleAuthorizationCode !== "string" ||
        !input.appleAuthorizationCode.trim())
    )
      return jsonError(
        "invalid_field",
        "Send a valid Apple authorization code or omit it.",
        { field: "appleAuthorizationCode" },
      );
    const refusal = await deleteUserIdentity(
      access.owner,
      input.appleAuthorizationCode,
      access.proof,
    );
    if (refusal)
      return jsonError(
        refusal,
        refusal === "apple_authorization_required"
          ? "Authorize Apple again before deleting your account."
          : "We couldn't revoke Apple's permission. Your account hasn't been deleted. Try again.",
      );
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch {
    return jsonError(
      "not_confirmed",
      "We couldn't confirm account deletion. Try signing in again.",
    );
  }
}
