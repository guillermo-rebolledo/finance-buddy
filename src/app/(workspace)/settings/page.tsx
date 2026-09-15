import { getConfig } from "@/lib/config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { AppearanceSettings } from "@/components/appearance-settings";
import { SessionSettings } from "@/components/session-settings";
import { AccountSettings } from "@/components/account-settings";
export const dynamic = "force-dynamic";
export default async function Settings() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable") return <WorkspaceUnavailable />;
  if (access.status !== "authorized") redirect("/login");
  return (
    <AppearanceSettings>
      <SessionSettings />
      <AccountSettings appleClientId={getConfig()?.apple?.clientId[0]} />
    </AppearanceSettings>
  );
}
