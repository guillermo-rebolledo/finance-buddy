import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { BudgetsOverview } from "@/components/budgets-overview";
import { listBudgets } from "@/lib/budgets";
export const dynamic = "force-dynamic";
export default async function Budgets() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable") return <WorkspaceUnavailable />;
  if (access.status !== "authorized") redirect("/login");
  const list = await listBudgets(access.userId).catch(() => null);
  return (
    <AppShell>
      <BudgetsOverview initial={list} />
    </AppShell>
  );
}
