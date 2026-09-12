import { authorizeOwner, jsonError, privateHeaders } from "@/lib/access";
import { mexicoToday, parseSummaryRequest } from "@/lib/financial";
import { summarize } from "@/lib/journal";
import { reportDocument, reportFileName } from "@/lib/report";
export const dynamic = "force-dynamic";
// The snapshot covers the period the request names, never the current one, and
// it is built from one summary read so its totals, breakdown and movements all
// describe the same state. Nothing is stored: the document exists only in this
// reply, and only for the owner who asked for it.
export async function GET(request: Request) {
  const access = await authorizeOwner(request, false);
  if ("denied" in access) return access.denied;
  const url = new URL(request.url);
  const period = parseSummaryRequest(
    url.searchParams.get("kind"),
    url.searchParams.get("date"),
    mexicoToday(),
  );
  if (!period)
    return jsonError("Choose a day, week, or month with a valid date.", 400);
  try {
    const summary = await summarize(access.owner, period);
    const document = await reportDocument(summary);
    return new Response(document as BodyInit, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportFileName(summary)}"`,
      },
    });
  } catch {
    return jsonError("Could not create the PDF. Please retry the export.", 503);
  }
}
