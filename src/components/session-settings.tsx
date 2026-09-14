"use client";
import { useState } from "react";
import { authClient as client } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// The one remote control for a lost or stolen phone: every session of the owner
// ends at once, this browser's included. It is confirmed first, and it never
// claims success the server did not confirm.
export function SessionSettings() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function revoke() {
    setPending(true);
    setFailed(false);
    try {
      const result = await client.revokeSessions();
      if (result.error) throw new Error("Sessions were not revoked");
      window.location.replace("/login");
    } catch {
      setFailed(true);
      setPending(false);
      setOpen(false);
    }
  }
  return (
    <section aria-label="Sessions">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Sessions</h2>
          </CardTitle>
          <CardDescription>
            End every Finance Buddy session at once, including this browser and
            the iOS app. Handy if your phone goes missing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-start gap-3">
            <AlertDialog
              open={open}
              onOpenChange={(next) => {
                if (!pending) setOpen(next);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="outline">Sign out everywhere</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
                  <AlertDialogDescription>
                    We&apos;ll sign out this browser and every phone using Finance
                    Buddy. You&apos;ll need to sign in again on each device. Your
                    journal stays exactly as it is.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>
                    Keep sessions
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={pending}
                    onClick={(event) => {
                      // The dialog stays open until the server confirms.
                      event.preventDefault();
                      revoke();
                    }}
                  >
                    {pending ? "Signing out…" : "Sign out everywhere"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {failed && (
              <Alert variant="destructive">
                <AlertDescription>
                  We couldn&apos;t sign out your other sessions. Try again.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
