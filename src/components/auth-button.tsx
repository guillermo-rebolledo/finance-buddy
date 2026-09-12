"use client";
import { useState } from "react";
import { authClient as client } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function AuthButton({
  action,
  disabled = false,
}: {
  action: "signin" | "signout";
  disabled?: boolean;
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
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        variant={action === "signin" ? "default" : "outline"}
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={submit}
      >
        {pending
          ? action === "signin"
            ? "Connecting…"
            : "Signing out…"
          : action === "signin"
            ? "Continue with Google"
            : "Sign out"}
      </Button>
      {error && (
        <Alert variant="destructive">
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
