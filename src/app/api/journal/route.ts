import { authorizeOwner, jsonError, privateHeaders } from "@/lib/access";
import {
  mexicoToday,
  parseSummaryRequest,
  validateEntry,
} from "@/lib/financial";
import { saveEntry, summarize } from "@/lib/journal";
export const dynamic = "force-dynamic";

async function handle(request: Request, write: boolean) {
  const access = await authorizeOwner(request, write);
  if ("denied" in access) return access.denied;
  try {
    if (!write) {
      const url = new URL(request.url);
      const period = parseSummaryRequest(
        url.searchParams.get("kind"),
        url.searchParams.get("date"),
        mexicoToday(),
      );
      if (!period)
        return jsonError(
          "Choose a day, week, or month with a valid date.",
          400,
        );
      return Response.json(await summarize(access.owner, period), {
        headers: privateHeaders,
      });
    }
    const input = await request.json().catch(() => null);
    const error = validateEntry(input, mexicoToday());
    if (error) return jsonError(error.message, 400, error.field);
    const categoryError = await saveEntry(access.owner, input);
    if (categoryError)
      return jsonError(categoryError.message, 400, categoryError.field);
    return Response.json({ saved: true }, { headers: privateHeaders });
  } catch {
    return jsonError(
      write
        ? "Save could not be confirmed. Retry this entry safely."
        : "Could not load this period. Please retry.",
      503,
    );
  }
}
export function GET(request: Request) {
  return handle(request, false);
}
export function POST(request: Request) {
  return handle(request, true);
}
