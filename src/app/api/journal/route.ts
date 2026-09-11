import { getAccess } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { mexicoToday, validateEntry } from "@/lib/financial";
import { saveEntry, weeklyReport } from "@/lib/journal";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request, write: boolean) {
  const access = await getAccess(request.headers);
  if (access.status !== "authorized")
    return Response.json(
      { error: "Workspace access required." },
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
  if (
    write &&
    (request.headers.get("origin") !== getConfig()?.origin ||
      !request.headers.get("content-type")?.startsWith("application/json"))
  )
    return Response.json(
      { error: "Request not allowed." },
      { status: 403, headers },
    );
  try {
    if (!write)
      return Response.json(await weeklyReport(access.userId), { headers });
    const input = await request.json().catch(() => null);
    const error = validateEntry(input, mexicoToday());
    if (error)
      return Response.json(
        { error: error.message, field: error.field },
        { status: 400, headers },
      );
    const categoryError = await saveEntry(access.userId, input);
    if (categoryError)
      return Response.json(
        { error: categoryError.message, field: categoryError.field },
        { status: 400, headers },
      );
    return Response.json({ saved: true }, { headers });
  } catch {
    return Response.json(
      {
        error: write
          ? "Save could not be confirmed. Retry this entry safely."
          : "Could not load your weekly overview. Please retry.",
      },
      { status: 503, headers },
    );
  }
}
export function GET(request: Request) {
  return handle(request, false);
}
export function POST(request: Request) {
  return handle(request, true);
}
