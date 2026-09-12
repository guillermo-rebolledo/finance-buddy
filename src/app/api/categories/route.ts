import { authorizeOwner, jsonError, privateHeaders } from "@/lib/access";
import { validateCategoryChange, type CategoryChange } from "@/lib/financial";
import { changeCategory, listCategories } from "@/lib/categories";
export const dynamic = "force-dynamic";

async function handle(request: Request, write: boolean) {
  const access = await authorizeOwner(request, write);
  if ("denied" in access) return access.denied;
  try {
    if (!write)
      return Response.json(await listCategories(access.owner), {
        headers: privateHeaders,
      });
    const input = await request.json().catch(() => null);
    const invalid = validateCategoryChange(input);
    if (invalid) return jsonError(invalid.message, 400, invalid.field);
    const failed = await changeCategory(access.owner, input as CategoryChange);
    if (failed) return jsonError(failed.message, 400, failed.field);
    return Response.json({ changed: true }, { headers: privateHeaders });
  } catch {
    return jsonError(
      write
        ? "The change could not be confirmed. Please retry it."
        : "Could not load your categories. Please retry.",
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
