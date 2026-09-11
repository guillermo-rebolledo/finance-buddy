"use client";
import { useRef, useState } from "react";
import {
  money,
  validateEntry,
  type EntryInput,
  type WeeklyReport,
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

export function WeeklyOverview({ initial }: { initial: WeeklyReport | null }) {
  const [report, setReport] = useState(initial);
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
  const invalidField = error.startsWith("Choose income")
    ? "kind"
    : error.startsWith("Enter an amount")
      ? "amount"
      : error.startsWith("Choose a valid movement")
        ? "date"
        : error.startsWith("Choose an active category") ||
            error.startsWith("Choose an available category")
          ? "categoryId"
          : error.startsWith("Keep the note")
            ? "note"
            : null;
  const fieldProps = (name: string) => ({
    "aria-invalid": invalidField === name,
    "aria-describedby": invalidField === name ? "entry-error" : undefined,
  });
  const form = useRef<HTMLFormElement>(null);
  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/journal", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setReport(await response.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
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
    const invalid = validateEntry(entry, report!.today);
    if (invalid) {
      setError(invalid);
      requestAnimationFrame(() =>
        document.getElementById("entry-error")?.focus(),
      );
      return;
    }
    pending.current = entry;
    inFlight.current = true;
    setSaving(true);
    setError("");
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
        setError(
          result.error ||
            "Save could not be confirmed. Retry this entry safely.",
        );
        return;
      }
      pending.current = null;
      setUncertain(false);
      const current = report;
      setSuccess(
        current && (entry.date < current.start || entry.date > current.end)
          ? `Entry saved for ${entry.date}, outside this week. It is stored for future historical browsing.`
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
  return (
    <main className="flex flex-col gap-8 pb-16 pt-8 md:pt-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
            This week
          </h1>
          <p className="text-muted-foreground">
            {report
              ? `${report.start} – ${report.end} · Monday–Sunday`
              : "Your weekly overview"}
          </p>
          <p className="text-sm text-muted-foreground">Mexico City · MXN</p>
        </div>
        <Button
          size="lg"
          disabled={!report || loading}
          onClick={() => {
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
      {success && <p role="status">{success}</p>}
      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Weekly overview unavailable</AlertTitle>
          <AlertDescription>
            We could not load your current figures.{" "}
            {report && "Previously loaded figures may be out of date."}
            <Button variant="outline" disabled={loading} onClick={refresh}>
              {loading ? "Loading…" : "Retry overview"}
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
              Record income or a purchase, including card purchases, on its
              movement date.
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
                      <NativeSelectOption value="income">
                        Income
                      </NativeSelectOption>
                      <NativeSelectOption value="expense">
                        Expense
                      </NativeSelectOption>
                    </NativeSelect>
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
                      max={report.today}
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
                        .filter((category) => category.kind === kind)
                        .map((category) => (
                          <NativeSelectOption
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
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
            aria-label="Weekly totals"
            className="grid gap-4 md:grid-cols-3"
          >
            {[
              ["Total income", report.income],
              ["Total expenses", report.expenses],
              ["Net change", report.netChange],
            ].map(([label, amount]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>
                    <span className="break-all text-2xl tabular-nums">
                      {money(amount)}
                    </span>
                  </CardTitle>
                  {label === "Net change" && (
                    <CardDescription>
                      Recorded activity for the week
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
                All expenses recorded in this period.
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
                <p className="text-muted-foreground">No expenses this week.</p>
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
                          {entry.kind === "income" ? "Income" : "Expense"} ·{" "}
                          {entry.category}
                        </span>
                        <span className="font-medium tabular-nums">
                          {money(entry.amount)}
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
                    <EmptyTitle>No entries this week</EmptyTitle>
                    <EmptyDescription>
                      Add income or an expense to start your weekly overview.
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
