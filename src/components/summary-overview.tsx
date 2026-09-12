"use client";
import { useRef, useState } from "react";
import {
  entryKindDetail,
  entryKinds,
  entryKindDetails,
  isCalendarDate,
  money,
  periodKindDetails,
  periodKinds,
  periodLabel,
  shiftPeriod,
  signedAmount,
  signedMoney,
  summaryPeriod,
  validateEntry,
  type EntryInput,
  type PeriodKind,
  type Summary,
} from "@/lib/financial";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export function SummaryOverview({ initial }: { initial: Summary | null }) {
  const [summary, setSummary] = useState(initial);
  // The period the controls ask for. A null date follows Mexico City's current
  // date, so an open page keeps resolving the current period across midnight
  // without ever trusting the browser clock.
  const [view, setView] = useState<{ kind: PeriodKind; date: string | null }>({
    kind: initial?.kind ?? "week",
    date: null,
  });
  const [loadError, setLoadError] = useState(!initial);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<EntryInput | null>(null);
  const inFlight = useRef(false);
  const [invalidField, setInvalidField] = useState<keyof EntryInput | null>(
    null,
  );
  const fieldProps = (name: string) => ({
    "aria-invalid": invalidField === name,
    "aria-describedby": invalidField === name ? "entry-error" : undefined,
  });
  const form = useRef<HTMLFormElement>(null);
  const requested = useRef(0);
  // One request per period selection: the label, totals, breakdown and rows on
  // screen always come from a single resolved period, never a mixture.
  async function show(next: { kind: PeriodKind; date: string | null }) {
    setView(next);
    const query = new URLSearchParams({ kind: next.kind });
    if (next.date) query.set("date", next.date);
    const sequence = ++requested.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/journal?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const latest: Summary = await response.json();
      // A slower earlier request must not replace the period now on screen.
      if (sequence === requested.current) {
        setSummary(latest);
        setLoadError(false);
      }
      return latest;
    } catch {
      if (sequence === requested.current) setLoadError(true);
    } finally {
      if (sequence === requested.current) setLoading(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const entry = pending.current ?? {
      id: crypto.randomUUID(),
      kind,
      amount: String(data.get("amount") ?? ""),
      date: String(data.get("date") ?? ""),
      categoryId: String(data.get("categoryId") ?? "") || null,
      note: String(data.get("note") ?? ""),
    };
    inFlight.current = true;
    setSaving(true);
    const current = await show(view);
    if (!current) {
      setInvalidField(null);
      setError(
        "Could not check the current date. Your input is preserved; retry when the overview is available.",
      );
      inFlight.current = false;
      setSaving(false);
      return;
    }
    const invalid = validateEntry(entry, current.today);
    if (invalid) {
      inFlight.current = false;
      setSaving(false);
      setError(invalid.message);
      setInvalidField(invalid.field);
      requestAnimationFrame(() =>
        document.getElementById("entry-error")?.focus(),
      );
      return;
    }
    pending.current = entry;
    inFlight.current = true;
    setSaving(true);
    setError("");
    setInvalidField(null);
    setSuccess("");
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 400) {
          pending.current = null;
          setUncertain(false);
        } else setUncertain(true);
        setInvalidField(result.field ?? null);
        setError(
          result.error ||
            "Save could not be confirmed. Retry this entry safely.",
        );
        return;
      }
      pending.current = null;
      setUncertain(false);
      setSuccess(
        entry.date < current.start || entry.date > current.end
          ? `Entry saved for ${entry.date}, outside the period you are viewing. Jump to that date to see it.`
          : "Entry saved.",
      );
      form.current?.reset();
      setKind("");
      setOpen(false);
      await show(view);
    } catch {
      setUncertain(true);
      setError(
        "Save could not be confirmed. Retry this same entry safely; do not create a replacement.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  // The date the controls step from: the pending selection, or the period the
  // server last resolved while the selection still follows today.
  const anchor = view.date ?? summary?.date ?? "";
  // Every label describes the period actually loaded, so a failed or pending
  // selection never relabels figures that came from another period.
  const loaded = summary && periodKindDetails[summary.kind];
  const showsToday =
    summary && summary.today >= summary.start && summary.today <= summary.end;
  const requestedLabel = anchor
    ? periodLabel(view.kind, summaryPeriod(view.kind, anchor))
    : `the current ${periodKindDetails[view.kind].label.toLowerCase()}`;
  return (
    <main
      aria-busy={loading}
      className="flex flex-col gap-8 pb-16 pt-8 md:pt-14"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
            {summary && loaded
              ? showsToday
                ? loaded.current
                : periodLabel(summary.kind, summary)
              : "Your summary"}
          </h1>
          <p className="text-muted-foreground">
            {summary ? `${summary.start} – ${summary.end}` : "No period loaded"}
          </p>
          <p className="text-sm text-muted-foreground">Mexico City · MXN</p>
        </div>
        <Button
          size="lg"
          disabled={!summary || loading}
          onClick={async () => {
            if (!open && !(await show(view))) return;
            setOpen(true);
            setSuccess("");
            requestAnimationFrame(() =>
              document.getElementById("kind")?.focus(),
            );
          }}
        >
          Add entry
        </Button>
      </div>
      <section
        aria-label="Period navigation"
        className="flex flex-col gap-3 border-y py-4"
      >
        <div className="flex flex-wrap items-end gap-4">
          <Field className="w-32">
            <FieldLabel htmlFor="period">Period</FieldLabel>
            <NativeSelect
              id="period"
              value={view.kind}
              onChange={(event) =>
                // The anchor date survives a change of period kind.
                show({
                  kind: event.target.value as PeriodKind,
                  date: view.date,
                })
              }
            >
              {periodKinds.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {periodKindDetails[option].label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field className="w-48">
            <FieldLabel htmlFor="anchor">Jump to date</FieldLabel>
            <Input
              id="anchor"
              type="date"
              value={anchor}
              onChange={(event) => {
                if (isCalendarDate(event.target.value))
                  show({ kind: view.kind, date: event.target.value });
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {/* With no period known yet there is nothing to step from; the date
                picker and Back to current period still reach one. */}
            <Button
              variant="outline"
              disabled={!anchor}
              onClick={() =>
                show({
                  kind: view.kind,
                  date: shiftPeriod(view.kind, anchor, -1),
                })
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!anchor}
              onClick={() =>
                show({
                  kind: view.kind,
                  date: shiftPeriod(view.kind, anchor, 1),
                })
              }
            >
              Next
            </Button>
            <Button
              variant="outline"
              onClick={() => show({ kind: view.kind, date: null })}
            >
              Back to current period
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {(loaded ?? periodKindDetails[view.kind]).note}
          {loading && " Loading…"}
        </p>
      </section>
      {success && <p role="status">{success}</p>}
      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Period unavailable</AlertTitle>
          <AlertDescription>
            We could not load {requestedLabel}.{" "}
            {summary &&
              `The figures below still describe ${periodLabel(summary.kind, summary)}.`}
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => show(view)}
            >
              {loading ? "Loading…" : "Retry period"}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {open && summary && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Add entry</h2>
            </CardTitle>
            <CardDescription>
              Record income, a purchase including card purchases, or a refund on
              the date the money moved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              ref={form}
              onSubmit={save}
              noValidate
              className="flex flex-col gap-6"
            >
              <fieldset disabled={saving || uncertain} className="min-w-0">
                <FieldGroup>
                  <Field data-invalid={invalidField === "kind"}>
                    <FieldLabel htmlFor="kind">Type</FieldLabel>
                    <NativeSelect
                      id="kind"
                      name="kind"
                      {...fieldProps("kind")}
                      value={kind}
                      onChange={(event) => setKind(event.target.value)}
                      required
                    >
                      <NativeSelectOption value="">
                        Choose a type
                      </NativeSelectOption>
                      {entryKinds.map((available) => (
                        <NativeSelectOption key={available} value={available}>
                          {entryKindDetails[available].label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {kind === "refund" && (
                      <p className="text-sm text-muted-foreground">
                        Enter the refunded amount as a positive number. It
                        reduces expenses on its receipt date.
                      </p>
                    )}
                  </Field>
                  <Field data-invalid={invalidField === "amount"}>
                    <FieldLabel htmlFor="amount">Amount (MXN)</FieldLabel>
                    <Input
                      id="amount"
                      name="amount"
                      {...fieldProps("amount")}
                      inputMode="decimal"
                      placeholder="0.00"
                      required
                    />
                  </Field>
                  <Field data-invalid={invalidField === "date"}>
                    <FieldLabel htmlFor="date">Movement date</FieldLabel>
                    <Input
                      id="date"
                      name="date"
                      {...fieldProps("date")}
                      type="date"
                      defaultValue={summary.today}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Today or earlier in Mexico City.
                    </p>
                  </Field>
                  <Field data-invalid={invalidField === "categoryId"}>
                    <FieldLabel htmlFor="categoryId">
                      Category (optional)
                    </FieldLabel>
                    <NativeSelect
                      key={kind}
                      id="categoryId"
                      name="categoryId"
                      {...fieldProps("categoryId")}
                      defaultValue=""
                    >
                      <NativeSelectOption value="">
                        Uncategorized
                      </NativeSelectOption>
                      {summary.categories
                        .filter(
                          (category) =>
                            category.kind ===
                            entryKindDetail(kind)?.categoryKind,
                        )
                        .map((category) => (
                          <NativeSelectOption
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
                    {kind === "refund" && (
                      <p className="text-sm text-muted-foreground">
                        Refunds use your active expense categories. An archived
                        category stays archived; leave the refund uncategorized
                        instead.
                      </p>
                    )}
                  </Field>
                  <Field data-invalid={invalidField === "note"}>
                    <FieldLabel htmlFor="note">Note (optional)</FieldLabel>
                    <Textarea
                      id="note"
                      name="note"
                      {...fieldProps("note")}
                      maxLength={2000}
                    />
                  </Field>
                </FieldGroup>
              </fieldset>
              {error && (
                <Alert variant="destructive" id="entry-error" tabIndex={-1}>
                  <AlertTitle>Entry needs attention</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap gap-3">
                <Button type="submit" size="lg" disabled={saving}>
                  {saving
                    ? "Saving…"
                    : uncertain
                      ? "Retry same entry"
                      : "Save entry"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={saving || uncertain}
                  onClick={() => {
                    setOpen(false);
                    setError("");
                    setInvalidField(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {summary && (
        <>
          <section
            aria-label="Period totals"
            className="grid gap-4 md:grid-cols-3"
          >
            {[
              ["Total income", money(summary.income)],
              ["Total expenses", money(summary.expenses)],
              ["Net change", signedMoney(summary.netChange)],
            ].map(([label, amount]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>
                    <span className="break-all text-2xl tabular-nums">
                      {amount}
                    </span>
                  </CardTitle>
                  {label === "Net change" && (
                    <CardDescription>
                      Recorded activity for this period
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            ))}
          </section>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Spending by category</h2>
              </CardTitle>
              <CardDescription>
                Expenses minus refunds recorded in this period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.breakdown.length ? (
                <ul className="flex flex-col gap-4">
                  {summary.breakdown.map((group) => (
                    <li
                      key={group.categoryId ?? "uncategorized"}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span className="break-words">{group.category}</span>
                      <span className="tabular-nums">
                        {money(group.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No expenses or refunds in this period.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Entries</h2>
              </CardTitle>
              <CardDescription>Latest movement date first.</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.entries.length ? (
                <ul className="divide-y">
                  {summary.entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-2 py-4 first:pt-0"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">
                          {entryKindDetail(entry.kind)?.label ?? entry.kind} ·{" "}
                          {entry.category}
                        </span>
                        <span className="font-medium tabular-nums">
                          {money(signedAmount(entry))}
                        </span>
                      </div>
                      <time
                        className="text-sm text-muted-foreground"
                        dateTime={entry.date}
                      >
                        {entry.date}
                      </time>
                      {entry.note && (
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {entry.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No entries in this period</EmptyTitle>
                    <EmptyDescription>
                      Add income, an expense, or a refund, or browse another
                      day, week, or month.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
