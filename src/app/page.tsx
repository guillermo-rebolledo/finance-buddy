import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { SummaryOverview } from "@/components/summary-overview";
import { summarize } from "@/lib/journal";
import { currentWeek, mexicoToday } from "@/lib/financial";
export const dynamic = "force-dynamic";
export default async function Home() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable") return <WorkspaceUnavailable />;
  if (access.status !== "authorized") redirect("/login");
  // The current week stays the landing view; other periods load from here.
  const summary = await summarize(
    access.userId,
    currentWeek(mexicoToday()),
  ).catch(() => null);
  return (
    <div className="mx-auto max-w-5xl px-6">
      <AppHeader />
      <SummaryOverview initial={summary} />
    </div>
  );
}
