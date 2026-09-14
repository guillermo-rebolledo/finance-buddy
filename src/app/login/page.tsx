import { getConfig } from "@/lib/config";
import { AuthButton } from "@/components/auth-button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";
import { BookOpen, LockKeyhole } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const config = getConfig();
  const configured = !!config;
  const failed = !!(await searchParams).error;
  return (
    <main className="relative mx-auto flex min-h-svh max-w-5xl flex-col justify-center gap-12 px-6 py-12 md:flex-row md:items-center md:gap-20">
      <section className="flex flex-1 flex-col gap-6">
        <div className="flex items-center gap-3 text-sm font-semibold tracking-wide">
          <BookOpen aria-hidden="true" className="size-6 text-primary" />{" "}
          FINANCE BUDDY
        </div>
        <h1 className="max-w-lg font-serif text-5xl leading-tight tracking-tight md:text-6xl">
          A little clarity.
          <br />
          Every day.
        </h1>
        <p className="max-w-sm text-lg leading-relaxed text-muted-foreground">
          A quiet place for your personal finances. Your journal, just for you.
        </p>
      </section>
      <div className="w-full md:max-w-sm">
        <Card>
          <CardHeader>
            <Badge variant="secondary">
              <LockKeyhole aria-hidden="true" /> Private workspace
            </Badge>
            <CardTitle>
              <h2>Welcome to Finance Buddy</h2>
            </CardTitle>
            <CardDescription>
              {config?.apple
                ? "Sign in with your Google or Apple account."
                : "Sign in with your Google account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-5">
              {!configured ? (
                <Alert>
                  <AlertTitle>Setup is not complete</AlertTitle>
                  <AlertDescription>
                    Sign-in is not available yet. Please try again once setup is
                    complete.
                  </AlertDescription>
                </Alert>
              ) : (
                failed && (
                  <Alert variant="destructive">
                    <AlertTitle>Sign-in was not completed</AlertTitle>
                    <AlertDescription>
                      Use an account with a verified email and try again.
                    </AlertDescription>
                  </Alert>
                )
              )}
              <AuthButton action="signin" disabled={!configured} />
              {config?.apple && <AuthButton action="signin" provider="apple" />}
            </div>
          </CardContent>
          <CardFooter>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your journal is private to your account.
            </p>
          </CardFooter>
        </Card>
      </div>
      {/* Last in reading order, so signing in stays the first stop for the
          keyboard, though it is drawn in the corner. */}
      <div className="absolute top-6 right-6">
        <ModeToggle />
      </div>
    </main>
  );
}
