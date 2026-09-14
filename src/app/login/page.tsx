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
  const { error } = await searchParams;
  return (
    <main className="relative mx-auto flex min-h-svh max-w-5xl flex-col justify-center gap-12 px-6 py-12 lg:flex-row lg:items-center lg:gap-20">
      <section className="flex flex-1 flex-col gap-6">
        <div className="flex items-center gap-3 text-sm font-semibold tracking-wide">
          <BookOpen aria-hidden="true" className="size-6 text-primary" />{" "}
          FINANCE BUDDY
        </div>
        <h1 className="max-w-lg font-serif text-5xl leading-tight tracking-tight lg:text-6xl">
          See where your money goes.
          <br />
          One entry at a time.
        </h1>
        <p className="max-w-sm text-lg leading-relaxed text-muted-foreground">
          Keep your income, spending, and refunds together in one private
          journal.
        </p>
      </section>
      <div className="w-full lg:max-w-sm">
        <Card>
          <CardHeader>
            <Badge variant="secondary">
              <LockKeyhole aria-hidden="true" /> Private journal
            </Badge>
            <CardTitle>
              <h2>Open your journal</h2>
            </CardTitle>
            <CardDescription>
              {config?.apple
                ? "Use Google or Apple to pick up where you left off."
                : "Use Google to pick up where you left off."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-5">
              {!configured ? (
                <Alert>
                  <AlertTitle>Sign-in isn&apos;t ready yet</AlertTitle>
                  <AlertDescription>
                    Finance Buddy still needs a little setup. Try again once
                    it&apos;s ready.
                  </AlertDescription>
                </Alert>
              ) : (
                !!error && (
                  <Alert variant="destructive">
                    <AlertTitle>That sign-in didn&apos;t work</AlertTitle>
                    <AlertDescription>
                      {error === "email_not_verified"
                        ? "Try again with an account that has a verified email."
                        : "Try signing in again. If it still doesn't work, try again later."}
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
              Only you can see the journal tied to this account.
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
