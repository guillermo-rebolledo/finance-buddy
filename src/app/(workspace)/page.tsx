import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
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
  return <SummaryOverview initial={summary} />;
}
