import { getConfig } from "@/lib/config";
import { getAccess, getAuth } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const auth = getAuth();
  if (!auth)
    return Response.json(
      { error: "Sign-in is not available yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  // Expose only the auth operations used by this private shell.
  if (
    ![
      "/sign-in/social",
      "/callback/google",
      "/get-session",
      "/sign-out",
    ].includes(path)
  )
    return new Response(null, { status: 404 });
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
    return Response.json({ error: "Access denied." }, { status: 403 });
  }
  try {
    return await auth.handler(request);
  } catch {
    return Response.json(
      { error: "Sign-in could not be completed. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export { handle as GET, handle as POST };
