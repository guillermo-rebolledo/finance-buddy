"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  LayoutDashboard,
  NotebookPen,
  Settings,
  Tags,
} from "lucide-react";
import { AuthButton } from "@/components/auth-button";
import { ModeToggle } from "@/components/mode-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const sections = [
  {
    label: "Journal",
    links: [
      { href: "/", label: "Entries", icon: NotebookPen },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/categories", label: "Categories", icon: Tags },
    ],
  },
  {
    label: "Preferences",
    links: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

// Every signed-in page shares one navigation drawer, so the registry, the
// dashboard, the Categories page and Settings are always one link apart. On
// desktop it collapses to icons; on a phone it is a sheet opened from the top bar.
export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  // Choosing a section on a phone closes the sheet, so the page chosen is the
  // page on screen.
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Finance Buddy">
              <Link href="/" onClick={close}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <BookOpen className="size-4" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Finance Buddy</span>
                  <span className="text-xs text-muted-foreground">
                    Personal journal
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Sections">
          {sections.map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.links.map((link) => (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === link.href}
                        tooltip={link.label}
                      >
                        <Link
                          href={link.href}
                          onClick={close}
                          aria-current={
                            pathname === link.href ? "page" : undefined
                          }
                        >
                          <link.icon aria-hidden="true" />
                          <span>{link.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col-reverse">
          <AuthButton action="signout" compact />
          <ModeToggle withSettings size="icon-sm" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
