import { jsonError } from "@/lib/access";
import { getConfig } from "@/lib/config";
import { getAccess, getAuth } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A native client signs in by presenting a Google ID token instead of following
// Google's redirect. It must carry the nonce the app handed Google, so a
// captured token cannot be replayed: Better Auth only compares a nonce it is
// given.
async function nativeSignIn(request: Request, path: string) {
  if (request.method !== "POST" || path !== "/sign-in/social") return null;
  const body = await request
    .clone()
    .json()
    .catch(() => null);
  if (body?.idToken === undefined) return null;
  const nonce = body.idToken?.nonce;
  return { nonce: typeof nonce === "string" && nonce.length > 0 };
}

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
  const native = await nativeSignIn(request, path);
  // A browser names its Origin on every POST, and it must be this app's. Only
  // a native client, which has none, may leave it out, and only to present an
  // ID token.
  const origin = request.headers.get("origin");
  if (
    request.method === "POST" &&
    (origin === null ? !native : origin !== getConfig()?.origin)
  )
    return jsonError("request_not_allowed", "Access denied.");
  if (native && !native.nonce)
    return jsonError(
      "invalid_field",
      "Sign-in could not be completed. Please try again.",
      { field: "idToken" },
    );
  let response;
  try {
    response = await auth.handler(request);
  } catch {
    return jsonError(
      "unavailable",
      "Sign-in could not be completed. Please try again.",
    );
  }
  // The session token is handed only to a client that signs in natively or
  // already presents a bearer token. A browser keeps its session in the
  // HTTP-only cookie, out of reach of page scripts.
  if (
    native ||
    request.headers.has("authorization") ||
    !response.headers.has("set-auth-token")
  )
    return response;
  const headers = new Headers(response.headers);
  headers.delete("set-auth-token");
  headers.delete("access-control-expose-headers");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
export { handle as GET, handle as POST };
