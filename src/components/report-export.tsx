"use client";
import { useState } from "react";
import { type Summary } from "@/lib/financial";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { SheetsExport } from "@/components/sheets-export";

const exportFailed =
  "The PDF could not be created, and your journal is unchanged. Retry the export.";

// Both snapshots cover the period whose figures are on screen, named by the
// summary the server resolved, so an export never quietly switches period.
export function ReportExport({
  summary,
  busy,
}: {
  summary: Summary | null;
  busy: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // The document arrives with the reply and is never stored or linked.
  async function exportReport() {
    if (!summary || exporting) return;
    setExporting(true);
    setError("");
    setDone("");
    try {
      const query = new URLSearchParams({
        kind: summary.kind,
        date: summary.date,
      });
      const response = await fetch(`/api/journal/export?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        // A refused export says why it was refused, so an expired session does
        // not read as a document that failed to render.
        const refusal = await response.json().catch(() => null);
        setError(refusal?.error || exportFailed);
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(
          response.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? "finance-buddy.pdf";
      const address = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = address;
      link.download = name;
      link.click();
      // Released only after the download has started: revoking in the same task
      // cancels it in some browsers.
      setTimeout(() => URL.revokeObjectURL(address), 10000);
      setDone(`Downloaded ${name}.`);
      requestAnimationFrame(() =>
        document.getElementById("report-status")?.focus(),
      );
    } catch {
      setError(exportFailed);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="outline"
          size="lg"
          disabled={!summary || busy || exporting}
          onClick={exportReport}
        >
          {exporting ? "Preparing PDF…" : "Export PDF"}
        </Button>
        {/* An export belongs to the period actually loaded, and is a fresh
            export whenever that period changes. */}
        {summary && (
          <SheetsExport
            key={`${summary.kind}:${summary.start}`}
            summary={summary}
            disabled={busy || exporting}
          />
        )}
      </div>
      {done && (
        <p role="status" id="report-status" tabIndex={-1} className="text-sm">
          {done}
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Export needs attention</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="outline" disabled={exporting} onClick={exportReport}>
              {exporting ? "Preparing PDF…" : "Retry export"}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
