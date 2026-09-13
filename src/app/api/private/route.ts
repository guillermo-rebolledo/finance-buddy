import { jsonError, privateHeaders } from "@/lib/access";
import { getAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const access = await getAccess(request.headers);
  if (access.status !== "authorized")
    return jsonError(
      access.status,
      access.status === "unavailable"
        ? "Workspace temporarily unavailable."
        : "Access denied.",
    );
  return Response.json(
    { userId: access.userId, database: "connected" },
    { headers: privateHeaders },
  );
}
