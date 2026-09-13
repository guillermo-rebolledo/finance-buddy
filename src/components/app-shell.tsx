import { cookies } from "next/headers";
import { BookOpen } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// The frame of every signed-in page: the navigation drawer, a slim top bar that
// shows or hides it, and one content column. Whether the drawer was left
// expanded or collapsed is remembered, so it is drawn that way from the server.
export async function AppShell({ children }: { children: React.ReactNode }) {
  const expanded = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={expanded}>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-6">
          <SidebarTrigger className="-ml-1 size-9" />
          <Separator
            orientation="vertical"
            className="mr-1 data-[orientation=vertical]:h-5 md:hidden"
          />
          <span className="flex items-center gap-2 text-sm font-semibold md:hidden">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            Finance Buddy
          </span>
        </header>
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
