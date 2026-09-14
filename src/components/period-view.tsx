"use client";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import {
  isCalendarDate,
  periodKindDetails,
  periodKinds,
  periodLabel,
  shiftPeriod,
  summaryPeriod,
  type PeriodKind,
  type Summary,
  type Trend,
} from "@/lib/financial";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";

// The period the controls ask for. A null date follows Mexico City's current
// date, so an open page keeps resolving the current period across midnight
// without ever trusting the browser clock.
export type View = { kind: PeriodKind; date: string | null };

// Both signed-in views select a period the same way: the registry and the
// dashboard share this selection, its request sequencing and its labels, so a
// figure, a chart and a heading can never describe different periods.
export function usePeriodView(
  initial: { summary: Summary | null; trend: Trend | null },
  withTrend: boolean,
  fallbackTitle: string,
) {
  const [summary, setSummary] = useState(initial.summary);
  const [trend, setTrend] = useState(initial.trend);
  const [view, setView] = useState<View>({
    kind: initial.summary?.kind ?? "week",
    date: null,
  });
  const [loadError, setLoadError] = useState(
    !initial.summary || (withTrend && !initial.trend),
  );
  const [loading, setLoading] = useState(false);
  const requested = useRef(0);
  // One request per period selection: everything on screen comes from a single
  // resolved period, never a mixture. Where charts are shown they are requested
  // with the figures and accepted with them, or neither is accepted.
  async function show(next: View) {
    setView(next);
    const query = new URLSearchParams({ kind: next.kind });
    if (next.date) query.set("date", next.date);
    const sequence = ++requested.current;
    setLoading(true);
    try {
      const replies = await Promise.all([
        fetch(`/api/journal?${query}`, { cache: "no-store" }),
        ...(withTrend
          ? [fetch(`/api/journal/trends?${query}`, { cache: "no-store" })]
          : []),
      ]);
      if (replies.some((reply) => !reply.ok)) throw new Error();
      const [latest, latestTrend] = (await Promise.all(
        replies.map((reply) => reply.json()),
      )) as [Summary, Trend | undefined];
      // A slower earlier request must not replace the period now on screen.
      if (sequence === requested.current) {
        setSummary(latest);
        if (latestTrend) setTrend(latestTrend);
        setLoadError(false);
      }
      return latest;
    } catch {
      if (sequence === requested.current) setLoadError(true);
    } finally {
      if (sequence === requested.current) setLoading(false);
    }
  }
  // The date the controls step from: the pending selection, or the period the
  // server last resolved while the selection still follows today.
  const anchor = view.date ?? summary?.date ?? "";
  // Every label describes the period actually loaded, so a failed or pending
  // selection never relabels figures that came from another period.
  const loaded = summary ? periodKindDetails[summary.kind] : null;
  const showsToday = Boolean(
    summary && summary.today >= summary.start && summary.today <= summary.end,
  );
  return {
    summary,
    trend,
    view,
    anchor,
    loading,
    loadError,
    show,
    loaded,
    title:
      summary && loaded
        ? showsToday
          ? loaded.current
          : periodLabel(summary.kind, summary)
        : fallbackTitle,
    requestedLabel: anchor
      ? periodLabel(view.kind, summaryPeriod(view.kind, anchor))
      : `the current ${periodKindDetails[view.kind].label.toLowerCase()}`,
  };
}

export function PeriodNavigation({
  view,
  anchor,
  loading,
  loaded,
  onShow,
}: {
  view: View;
  anchor: string;
  loading: boolean;
  loaded: (typeof periodKindDetails)[PeriodKind] | null;
  onShow: (next: View) => void;
}) {
  return (
    <section
      aria-label="Period navigation"
      className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-xs sm:p-4"
    >
      <div className="grid gap-3 sm:grid-cols-period sm:items-end">
        <Field>
          <FieldLabel htmlFor="period">Period</FieldLabel>
          <Select
            value={view.kind}
            onValueChange={(next) =>
              // The anchor date survives a change of period kind.
              onShow({ kind: next as PeriodKind, date: view.date })
            }
          >
            <SelectTrigger id="period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {periodKinds.map((option) => (
                <SelectItem key={option} value={option}>
                  {periodKindDetails[option].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="anchor">Jump to date</FieldLabel>
          {/* With no period known yet there is nothing to step from; the date
              picker and Back to current period still reach one. */}
          <ButtonGroup>
            <Button
              variant="outline"
              size="icon"
              disabled={!anchor}
              onClick={() =>
                onShow({ kind: view.kind, date: shiftPeriod(view.kind, anchor, -1) })
              }
            >
              <ChevronLeft aria-hidden="true" />
              <span className="sr-only">Previous</span>
            </Button>
            <Input
              id="anchor"
              type="date"
              value={anchor}
              onChange={(event) => {
                if (isCalendarDate(event.target.value))
                  onShow({ kind: view.kind, date: event.target.value });
              }}
            />
            <Button
              variant="outline"
              size="icon"
              disabled={!anchor}
              onClick={() =>
                onShow({ kind: view.kind, date: shiftPeriod(view.kind, anchor, 1) })
              }
            >
              <ChevronRight aria-hidden="true" />
              <span className="sr-only">Next</span>
            </Button>
          </ButtonGroup>
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-3">
        <p className="text-sm text-muted-foreground">
          {(loaded ?? periodKindDetails[view.kind]).note}
          {loading && " Loading…"}
        </p>
        <div className="-mx-2 flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onShow({ kind: view.kind, date: null })}
          >
            <RotateCcw aria-hidden="true" />
            Back to current period
          </Button>
        </div>
      </div>
    </section>
  );
}

// One refusal for a period that could not be loaded, on either view, naming the
// period still on screen rather than relabelling it.
export function PeriodUnavailable({
  requestedLabel,
  summary,
  loading,
  onRetry,
}: {
  requestedLabel: string;
  summary: Summary | null;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Period unavailable</AlertTitle>
      <AlertDescription>
        We could not load {requestedLabel}.{" "}
        {summary &&
          `The figures below still describe ${periodLabel(summary.kind, summary)}.`}
        <Button variant="outline" disabled={loading} onClick={onRetry}>
          {loading ? "Loading…" : "Retry period"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
