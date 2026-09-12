"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient as client } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function AuthButton({
  action,
  disabled = false,
  compact = false,
}: {
  action: "signin" | "signout";
  disabled?: boolean;
  // A quieter sign-out for the navigation drawer, reduced to its icon when the
  // drawer is collapsed while keeping its name for assistive technology.
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
              provider: "google",
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
  return (
    <div
      className={compact ? "flex min-w-0 flex-1 flex-col gap-3" : "flex flex-col gap-3"}
    >
      <Button
        size={compact ? "sm" : "lg"}
        variant={action === "signin" ? "default" : compact ? "ghost" : "outline"}
        className={
          compact
            ? "justify-start group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
            : undefined
        }
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={submit}
      >
        {compact && <LogOut aria-hidden="true" />}
        <span
          className={compact ? "group-data-[collapsible=icon]:sr-only" : undefined}
        >
          {pending
            ? action === "signin"
              ? "Connecting…"
              : "Signing out…"
            : action === "signin"
              ? "Continue with Google"
              : "Sign out"}
        </span>
      </Button>
      {error && (
        <Alert
          variant="destructive"
          className={compact ? "group-data-[collapsible=icon]:hidden" : undefined}
        >
          <AlertDescription>
            {action === "signin"
              ? "Sign-in could not be completed. Please try again."
              : "Sign-out failed. Please try again."}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
