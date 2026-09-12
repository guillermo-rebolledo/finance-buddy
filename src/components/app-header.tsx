import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AuthButton } from "@/components/auth-button";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

// Every signed-in page shares one header, so the registry, the dashboard, the
// Categories page and Settings are always one link apart.
export function AppHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b py-6">
      <div className="flex items-center gap-3 font-semibold">
        <BookOpen className="size-5 text-primary" aria-hidden="true" />
        Finance Buddy
      </div>
      <nav aria-label="Sections" className="flex flex-wrap items-center gap-1">
        <Button asChild variant="ghost">
          <Link href="/">Entries</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/categories">Categories</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/settings">Settings</Link>
        </Button>
      </nav>
      <div className="flex items-start gap-2">
        <ModeToggle withSettings />
        <AuthButton action="signout" />
      </div>
    </header>
  );
}
