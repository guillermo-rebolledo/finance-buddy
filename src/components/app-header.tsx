import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AuthButton } from "@/components/auth-button";
import { Button } from "@/components/ui/button";

// Both signed-in pages share one header, so the overview and the Categories page
// are always one link apart.
export function AppHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b py-6">
      <div className="flex items-center gap-3 font-semibold">
        <BookOpen className="size-5 text-primary" aria-hidden="true" />
        Finance Buddy
      </div>
      <nav aria-label="Sections" className="flex flex-wrap items-center gap-1">
        <Button asChild variant="ghost">
          <Link href="/">Overview</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/categories">Categories</Link>
        </Button>
      </nav>
      <AuthButton action="signout" />
    </header>
  );
}
