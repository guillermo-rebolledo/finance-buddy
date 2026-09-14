import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { AppearanceSettings } from "@/components/appearance-settings";
import { SessionSettings } from "@/components/session-settings";
export const dynamic = "force-dynamic";
export default async function Settings() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable") return <WorkspaceUnavailable />;
  if (access.status !== "authorized") redirect("/login");
  return (
    <AppShell>
      <AppearanceSettings>
        <SessionSettings />
      </AppearanceSettings>
    </AppShell>
  );
}
