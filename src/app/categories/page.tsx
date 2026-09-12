import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { CategoryManager } from "@/components/category-manager";
import { listCategories } from "@/lib/categories";
export const dynamic = "force-dynamic";
export default async function Categories() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable") return <WorkspaceUnavailable />;
  if (access.status !== "authorized") redirect("/login");
  const lists = await listCategories(access.userId).catch(() => null);
  return (
    <AppShell>
      <CategoryManager initial={lists} />
    </AppShell>
  );
}
