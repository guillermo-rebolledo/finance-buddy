import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { DashboardOverview } from "@/components/dashboard-overview";
import { summarize } from "@/lib/journal";
import { trendReport } from "@/lib/trends";
import { currentWeek, mexicoToday } from "@/lib/financial";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable") return <WorkspaceUnavailable />;
  if (access.status !== "authorized") redirect("/login");
  // The current week is the landing selection here too, so moving between the
  // registry and the dashboard never changes which period is being read.
  const request = currentWeek(mexicoToday());
  const [summary, trend] = await Promise.all([
    summarize(access.userId, request).catch(() => null),
    trendReport(access.userId, request).catch(() => null),
  ]);
  return (
    <AppShell>
      <DashboardOverview initial={{ summary, trend }} />
    </AppShell>
  );
}
