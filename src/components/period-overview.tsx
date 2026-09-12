"use client";
import { useRef, useState } from "react";
import {
  entryKindDetail,
  entryKinds,
  entryKindDetails,
  granularities,
  granularityDetails,
  isCalendarDate,
  money,
  periodLabel,
  shiftPeriod,
  signedAmount,
  signedMoney,
  validateEntry,
  type EntryInput,
  type Granularity,
  type PeriodReport,
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

export function PeriodOverview({ initial }: { initial: PeriodReport | null }) {
  const [report, setReport] = useState(initial);
  const [granularity, setGranularity] = useState<Granularity>(
    initial?.granularity ?? "week",
  );
  // A null anchor follows Mexico City's current date, so the page keeps
  // resolving the current period across midnight without a browser clock.
  const [anchor, setAnchor] = useState<string | null>(null);
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
  // Every period change goes through one request, so the label, totals,
  // breakdown and rows on screen always come from the same resolved period.
  async function load(
    next: { granularity?: Granularity; anchor?: string | null } = {},
  ) {
    const selected = next.granularity ?? granularity;
    const date = next.anchor === undefined ? anchor : next.anchor;
    setGranularity(selected);
    setAnchor(date);
    const query = new URLSearchParams({ granularity: selected });
    if (date) query.set("date", date);
    const sequence = ++requested.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/journal?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const latest: PeriodReport = await response.json();
      // A slower earlier request must not replace the period now on screen.
      if (sequence === requested.current) {
        setReport(latest);
        setLoadError(false);
      }
      return latest;
    } catch {
      if (sequence === requested.current) setLoadError(true);
    } finally {
      if (sequence === requested.current) setLoading(false);
    }
  }
  function refresh() {
    return load();
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
    const current = await refresh();
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
      await refresh();
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
  // The anchor the controls act on: the period the server last resolved, or the
  // pending selection while no report has loaded.
  const selected = report?.date ?? anchor ?? "";
  const shown = report?.granularity ?? granularity;
  const current =
    report && report.today >= report.start && report.today <= report.end;
  return (
    <main aria-busy={loading} className="flex flex-col gap-8 pb-16 pt-8 md:pt-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
            {report
              ? current
                ? granularityDetails[shown].current
                : periodLabel(shown, report)
              : "Your overview"}
          </h1>
          <p className="text-muted-foreground">
            {report ? `${report.start} – ${report.end}` : "No period loaded"}
          </p>
          <p className="text-sm text-muted-foreground">Mexico City · MXN</p>
        </div>
        <Button
          size="lg"
          disabled={!report || loading}
          onClick={async () => {
            if (!open && !(await refresh())) return;
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
            <FieldLabel htmlFor="granularity">Period</FieldLabel>
            <NativeSelect
              id="granularity"
              value={granularity}
              onChange={(event) =>
                load({ granularity: event.target.value as Granularity })
              }
            >
              {granularities.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {granularityDetails[option].label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field className="w-48">
            <FieldLabel htmlFor="anchor">Jump to date</FieldLabel>
            <Input
              id="anchor"
              type="date"
              value={selected}
              onChange={(event) => {
                if (isCalendarDate(event.target.value))
                  load({ anchor: event.target.value });
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!selected}
              onClick={() =>
                load({ anchor: shiftPeriod(granularity, selected, -1) })
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!selected}
              onClick={() =>
                load({ anchor: shiftPeriod(granularity, selected, 1) })
              }
            >
              Next
            </Button>
            <Button variant="outline" onClick={() => load({ anchor: null })}>
              Back to current period
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {granularityDetails[granularity].note}
          {loading && " Loading…"}
        </p>
      </section>
      {success && <p role="status">{success}</p>}
      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Period unavailable</AlertTitle>
          <AlertDescription>
            We could not load the figures for this period.{" "}
            {report && "Previously loaded figures may be out of date."}
            <Button variant="outline" disabled={loading} onClick={refresh}>
              {loading ? "Loading…" : "Retry period"}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {open && report && (
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
                      defaultValue={report.today}
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
                      {report.categories
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
      {report && (
        <>
          <section
            aria-label="Period totals"
            className="grid gap-4 md:grid-cols-3"
          >
            {[
              ["Total income", money(report.income)],
              ["Total expenses", money(report.expenses)],
              ["Net change", signedMoney(report.netChange)],
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
              {report.breakdown.length ? (
                <ul className="flex flex-col gap-4">
                  {report.breakdown.map((group) => (
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
              {report.entries.length ? (
                <ul className="divide-y">
                  {report.entries.map((entry) => (
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
