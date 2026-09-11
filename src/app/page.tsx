import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { AuthButton } from "@/components/auth-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { BookOpen, Check } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Home() {
  const access = await getAccess(await headers());
  if (access.status === "unavailable")
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <Alert>
          <AlertTitle>Workspace temporarily unavailable</AlertTitle>
          <AlertDescription>
            We could not open your workspace. Please try again shortly.
          </AlertDescription>
        </Alert>
      </main>
    );
  if (access.status !== "authorized") redirect("/login");
  return (
    <div className="mx-auto max-w-5xl px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b py-6">
        <div className="flex items-center gap-3 font-semibold">
          <BookOpen className="size-5 text-primary" aria-hidden="true" />
          Finance Buddy
        </div>
        <AuthButton action="signout" />
      </header>
      <NavigationMenu className="py-4" aria-label="Main navigation">
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="/" active>
              Home
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
      <main className="flex flex-col gap-8 pb-16 pt-8 md:pt-14">
        <div className="flex flex-col items-start gap-4">
          <Badge variant="secondary">Private workspace</Badge>
          <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
            Welcome home.
          </h1>
          <p className="text-muted-foreground">
            A fresh start for your personal finances.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your personal finance journal</h2>
            </CardTitle>
            <CardDescription>Your private space is ready.</CardDescription>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookOpen aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Room for your everyday finances</EmptyTitle>
                <EmptyDescription>
                  Recording financial movements and viewing summaries will
                  arrive in the next update.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Check className="size-4" aria-hidden="true" />
          Database connected · Session active
        </p>
      </main>
    </div>
  );
}
