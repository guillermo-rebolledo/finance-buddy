import { getAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const access = await getAccess(request.headers);
  const headers = { "Cache-Control": "private, no-store" };
  if (access.status !== "authorized")
    return Response.json(
      {
        error:
          access.status === "unavailable"
            ? "Workspace temporarily unavailable."
            : "Access denied.",
      },
      {
        status:
          access.status === "unavailable"
            ? 503
            : access.status === "forbidden"
              ? 403
              : 401,
        headers,
      },
    );
  return Response.json(
    { userId: access.userId, database: "connected" },
    { headers },
  );
}
