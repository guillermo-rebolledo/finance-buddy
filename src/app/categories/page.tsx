import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { CategoryManager } from "@/components/category-manager";
import { listCategories } from "@/lib/categories";
export const dynamic = "force-dynamic";
export default async function Categories() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable")
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <Alert>
          <AlertTitle>Workspace temporarily unavailable</AlertTitle>
          <AlertDescription>
            We could not open your workspace. Please try again shortly.
          </AlertDescription>
        </Alert>
      </main>
    );
  if (access.status !== "authorized") redirect("/login");
  const lists = await listCategories(access.userId).catch(() => null);
  return (
    <div className="mx-auto max-w-5xl px-6">
      <AppHeader />
      <CategoryManager initial={lists} />
    </div>
  );
}
