import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { AppearanceSettings } from "@/components/appearance-settings";
export const dynamic = "force-dynamic";
export default async function Settings() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable") return <WorkspaceUnavailable />;
  if (access.status !== "authorized") redirect("/login");
  return (
    <div className="mx-auto max-w-5xl px-6">
      <AppHeader />
      <AppearanceSettings />
    </div>
  );
}
