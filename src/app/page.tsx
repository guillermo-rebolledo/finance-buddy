import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AuthButton } from "@/components/auth-button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { BookOpen } from "lucide-react";
import { SummaryOverview } from "@/components/summary-overview";
import { summarize } from "@/lib/journal";
import { currentWeek, mexicoToday } from "@/lib/financial";
export const dynamic = "force-dynamic";
export default async function Home() {
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
  // The current week stays the landing view; other periods load from here.
  const summary = await summarize(
    access.userId,
    currentWeek(mexicoToday()),
  ).catch(() => null);
  return (
    <div className="mx-auto max-w-5xl px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b py-6">
        <div className="flex items-center gap-3 font-semibold">
          <BookOpen className="size-5 text-primary" aria-hidden="true" />
          Finance Buddy
        </div>
        <AuthButton action="signout" />
      </header>
      <SummaryOverview initial={summary} />
    </div>
  );
}
