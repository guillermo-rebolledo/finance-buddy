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
    const refused =
      invalid ??
      (await changeCategory(access.owner, input as CategoryChange));
    if (refused)
      return jsonError("invalid_field", refused.message, {
        field: refused.field,
      });
    return Response.json({ changed: true }, { headers: privateHeaders });
  } catch {
    return write
      ? jsonError(
          "not_confirmed",
          "We couldn't confirm that change. Try it again.",
        )
      : jsonError(
          "unavailable",
          "We couldn't load your categories. Try again.",
        );
  }
}
export function GET(request: Request) {
  return handle(request, false);
}
export function POST(request: Request) {
  return handle(request, true);
}
