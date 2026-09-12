"use client";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { periodLabel, sheetsScope, type Summary } from "@/lib/financial";
import { authClient as client } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// Export authorization is asked for separately from sign-in, only when an export
// needs it, and only for the files this app creates.
async function connect() {
  return client.linkSocial({
    provider: "google",
    scopes: [sheetsScope],
    // Google returns a refresh token only for an offline grant it has just
    // consented to, and a reconnection has to be able to replace a revoked one.
    additionalParams: { access_type: "offline", prompt: "consent" },
    callbackURL: "/?sheets=connected",
    errorCallbackURL: "/?sheets=denied",
  });
}

// One export of one period into one new spreadsheet. The identifier is kept
// while a failure can be retried as the same export, and replaced only when the
// owner deliberately asks for another spreadsheet.
export function SheetsExport({
  summary,
  disabled,
}: {
  summary: Summary;
  disabled: boolean;
}) {
  // Connecting leaves the app and comes back, so the outcome of that round trip
  // is read from where Google's callback left it.
  const notice = useSearchParams().get("sheets");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ url: string; title: string } | null>(null);
  // A failure says how the next press continues: reconnect first, retry this
  // same export, or deliberately create another spreadsheet.
  const [failure, setFailure] = useState<{
    message: string;
    reconnect: boolean;
    again: boolean;
  } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const attempt = useRef("");
  const label = periodLabel(summary.kind, summary);
  async function run() {
    if (pending) return;
    setPending(true);
    setFailure(null);
    setDone(null);
    if (!attempt.current) attempt.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: attempt.current,
          kind: summary.kind,
          date: summary.date,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        // A refusal that leaves the outcome unknown never retries into a second
        // spreadsheet: the next press is a deliberate new export.
        const again = response.status === 409;
        if (again) attempt.current = "";
        setFailure({
          message:
            result.error ||
            "The export could not be completed. Retry this same export.",
          reconnect: Boolean(result.reconnect),
          again,
        });
        return;
      }
      // The export is finished, so the next press is another explicit export
      // and gets a spreadsheet of its own.
      attempt.current = "";
      setDone(result);
    } catch {
      // The request left without an answer, so this export keeps its identifier:
      // retrying it either returns the spreadsheet it finished or says it could
      // not be confirmed, rather than creating a second one.
      setFailure({
        message:
          "The export could not be confirmed. Retry this same export; it will not create a second spreadsheet.",
        reconnect: false,
        again: false,
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        size="lg"
        disabled={disabled || pending || connecting}
        aria-busy={pending}
        onClick={run}
      >
        {pending ? "Exporting…" : "Export to Google Sheets"}
      </Button>
      {notice === "connected" && (
        <p role="status" className="text-sm text-muted-foreground">
          Google Sheets export is connected. Export the period you are viewing.
        </p>
      )}
      {notice === "denied" && (
        <p role="status" className="text-sm text-muted-foreground">
          Google Sheets export was not authorized. Your sign-in and journal are
          unaffected, and you can authorize it the next time you export.
        </p>
      )}
      {done && (
        <p role="status" id="export-status" tabIndex={-1} className="text-sm">
          Spreadsheet created for {label}.{" "}
          <a className="underline" href={done.url} target="_blank" rel="noreferrer">
            Open {done.title}
          </a>
        </p>
      )}
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>Export needs attention</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            {failure.message}
            {failure.reconnect ? (
              <Button
                variant="outline"
                disabled={connecting}
                onClick={() => {
                  setConnecting(true);
                  connect().catch(() => setConnecting(false));
                }}
              >
                {connecting ? "Connecting…" : "Connect Google Sheets export"}
              </Button>
            ) : (
              <Button variant="outline" disabled={pending} onClick={run}>
                {failure.again ? "Export a new spreadsheet" : "Retry export"}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
