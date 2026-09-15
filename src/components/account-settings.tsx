"use client";
import { useState } from "react";
import { loadAppleAuthorization } from "@/lib/apple-authorization";
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

export function AccountSettings({ appleClientId }: { appleClientId?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [needsApple, setNeedsApple] = useState(false);
  async function deleteAccount() {
    setPending(true);
    setFailed(false);
    try {
      let appleAuthorizationCode: string | undefined;
      if (needsApple) {
        const auth = window.AppleID?.auth;
        if (!auth || !appleClientId) throw new Error("Apple is unavailable");
        const state = crypto.randomUUID();
        auth.init({
          clientId: appleClientId,
          redirectURI: `${window.location.origin}/api/auth/callback/apple`,
          state,
          usePopup: true,
        });
        const response = await auth.signIn();
        if (
          response.authorization.state !== state ||
          !response.authorization.code
        )
          throw new Error("Apple authorization was not completed");
        appleAuthorizationCode = response.authorization.code;
      }
      const result = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appleAuthorizationCode }),
      });
      if (
        result.status === 403 &&
        (await result.json()).code === "apple_authorization_required" &&
        !needsApple &&
        appleClientId
      ) {
        await loadAppleAuthorization();
        setNeedsApple(true);
        setPending(false);
        return;
      }
      if (result.status !== 204) throw new Error("Account was not deleted");
      window.location.replace("/login?account=deleted");
    } catch {
      setFailed(true);
      setPending(false);
      setOpen(false);
    }
  }
  return (
    <section aria-label="Delete account">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Delete account</h2>
          </CardTitle>
          <CardDescription>
            Permanently delete your account and its journal. This cannot be
            undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-start gap-3">
            <AlertDialog
              open={open}
              onOpenChange={(next) => {
                if (!pending) {
                  setOpen(next);
                  if (next) {
                    setFailed(false);
                    setNeedsApple(false);
                  }
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete account</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your financial movements, categories, budgets and export
                    history will be permanently deleted. Spreadsheets already
                    exported to Google Drive, and PDFs you saved, are not
                    deleted. Every session ends, including the iPhone app and
                    other browsers. If you sign in with Google and Apple using
                    the same verified email, the one shared journal is deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {needsApple && (
                  <Alert role="status">
                    <AlertDescription>
                      Authorize Apple to finish deleting your account.
                      Cancelling keeps your account.
                    </AlertDescription>
                  </Alert>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>
                    Keep account
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={pending}
                    onClick={(event) => {
                      // The dialog stays open until the server confirms.
                      event.preventDefault();
                      deleteAccount();
                    }}
                  >
                    {pending
                      ? "Deleting…"
                      : needsApple
                        ? "Authorize Apple and delete"
                        : "Delete account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {failed && (
              <Alert variant="destructive">
                <AlertDescription>
                  Nothing was deleted. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
