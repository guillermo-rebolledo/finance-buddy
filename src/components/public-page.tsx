import Link from "next/link";
import { BookOpen } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export function PublicPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh">
      <header className="border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex min-h-16 max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 sm:px-8">
          <Link
            href="/login"
            className="mr-auto flex items-center gap-2 text-sm font-semibold tracking-wide"
          >
            <BookOpen aria-hidden="true" className="size-5 text-primary" />
            FINANCE BUDDY
          </Link>
          <nav
            aria-label="Legal and support"
            className="flex items-center gap-4 text-sm"
          >
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/privacy"
            >
              Privacy
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/support"
            >
              Support
            </Link>
          </nav>
          <ModeToggle size="icon" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-10 border-b pb-8">
          <h1 className="font-serif text-4xl tracking-tight text-balance sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {description}
          </p>
        </header>
        <div className="space-y-9 text-base leading-7 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:tracking-tight [&_p+p]:mt-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
      </main>
    </div>
  );
}
