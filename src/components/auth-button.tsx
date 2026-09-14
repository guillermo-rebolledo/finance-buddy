"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient as client } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SidebarMenuButton } from "@/components/ui/sidebar";
export function AuthButton({
  action,
  disabled = false,
  compact = false,
  provider = "google",
}: {
  action: "signin" | "signout";
  disabled?: boolean;
  provider?: "google" | "apple";
  // A quieter sign-out for the navigation drawer, drawn as one of its items and
  // reduced to its icon when the drawer is collapsed while keeping its name for
  // assistive technology.
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function submit() {
    setPending(true);
    setError(false);
    try {
      const result =
        action === "signin"
          ? await client.signIn.social({
              provider,
              callbackURL: "/",
              errorCallbackURL: "/login",
            })
          : await client.signOut();
      if (result.error) throw new Error("Authentication failed");
      if (action === "signout") window.location.replace("/login");
    } catch {
      setError(true);
      setPending(false);
    }
  }
  const label = pending
    ? action === "signin"
      ? "Connecting…"
      : "Signing out…"
    : action === "signin"
      ? provider === "apple"
        ? "Sign in with Apple"
        : "Continue with Google"
      : "Sign out";
  return (
    <div
      className={
        compact ? "flex min-w-0 flex-1 flex-col gap-3" : "flex flex-col gap-3"
      }
    >
      {compact ? (
        <SidebarMenuButton
          disabled={disabled || pending}
          aria-busy={pending}
          onClick={submit}
        >
          <LogOut aria-hidden="true" />
          <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
        </SidebarMenuButton>
      ) : (
        <Button
          size="lg"
          variant={action === "signin" ? "default" : "outline"}
          disabled={disabled || pending}
          aria-busy={pending}
          onClick={submit}
        >
          <span>{label}</span>
        </Button>
      )}
      {error && (
        <div
          className={
            compact ? "group-data-[collapsible=icon]:hidden" : undefined
          }
        >
          <Alert variant="destructive">
            <AlertDescription>
              {action === "signin"
                ? "We couldn't sign you in. Try again."
                : "We couldn't sign you out. Try again."}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
