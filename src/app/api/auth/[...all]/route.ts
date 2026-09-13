import { jsonError } from "@/lib/access";
import { getConfig } from "@/lib/config";
import { getAccess, getAuth } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const auth = getAuth();
  if (!auth) return jsonError("unavailable", "Sign-in is not available yet.");
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  // Expose only the auth operations used by this private shell.
  if (
    ![
      "/sign-in/social",
      // Export authorization: the same Google identity granting the extra file
      // access, asked for separately from sign-in.
      "/link-social",
      "/callback/google",
      "/get-session",
      "/sign-out",
    ].includes(path)
  )
    return jsonError("not_found", "Not found.");
  // The session reader keeps Better Auth's own reply shape, where null means
  // no session, so its refusals carry no body a client could mistake for one.
  if (path === "/get-session") {
    const access = await getAccess(request.headers);
    if (access.status === "forbidden" || access.status === "unavailable")
      return Response.json(null, {
        status: access.status === "forbidden" ? 403 : 503,
        headers: { "Cache-Control": "no-store" },
      });
  }
  if (
    request.method === "POST" &&
    request.headers.get("origin") !== getConfig()?.origin
  ) {
    return jsonError("request_not_allowed", "Access denied.");
  }
  try {
    return await auth.handler(request);
  } catch {
    return jsonError(
      "unavailable",
      "Sign-in could not be completed. Please try again.",
    );
  }
}
export { handle as GET, handle as POST };
