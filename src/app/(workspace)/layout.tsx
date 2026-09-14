import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAccess(await headers());
  if (access.status === "unavailable") return <WorkspaceUnavailable />;
  if (access.status !== "authorized") redirect("/login");
  // Pages also check access because this layout persists across navigation.
  return <AppShell>{children}</AppShell>;
}
