"use client";
import { useRef, useState } from "react";
import {
  entryKindDetail,
  entryKinds,
  entryKindDetails,
  entryTitle,
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
  type Entry,
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
import { SheetsExport } from "@/components/sheets-export";

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
  // The entry the open form corrects, or null while a new one is recorded.
  const [editing, setEditing] = useState<Entry | null>(null);
  // The entry whose permanent deletion awaits confirmation, and the deletion
  // currently in flight, so exactly one control reads as busy.
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [removeError, setRemoveError] = useState("");
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
  // What an unconfirmed write means depends on the write: a recording could be
  // duplicated by a replacement, a correction only writes the same values again.
  const unconfirmed = () =>
    editing
      ? "The correction could not be confirmed. Retry this same entry safely; it writes the same values again."
      : "Save could not be confirmed. Retry this same entry safely; do not create a replacement.";
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
  // One place opens the form for either purpose, on a period just reloaded, so
  // no stale message, marked field or previous entry's values survive into it.
  async function openForm(entry: Entry | null) {
    if (!(await show(view))) return;
    pending.current = null;
    setUncertain(false);
    setEditing(entry);
    setKind(entry?.kind ?? "");
    setError("");
    setInvalidField(null);
    setSuccess("");
    setOpen(true);
    requestAnimationFrame(() => document.getElementById("kind")?.focus());
  }
  // Deletion is permanent, so it happens only from the confirmation and only
  // once while pending. The control pressed is gone afterwards, along with the
  // row, so the outcome takes focus instead of the body.
  async function remove(entry: Entry) {
    if (deletingId) return;
    setDeletingId(entry.id);
    setRemoveError("");
    setSuccess("");
    try {
      const response = await fetch("/api/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setRemoveError(
          result.error ||
            "The deletion could not be confirmed. Retry it safely.",
        );
        return;
      }
      setRemoving(null);
      if (editing?.id === entry.id) {
        setOpen(false);
        setEditing(null);
      }
      setSuccess(`Deleted ${entryTitle(entry)}.`);
      await show(view);
      requestAnimationFrame(() =>
        document.getElementById("entry-status")?.focus(),
      );
    } catch {
      setRemoveError("The deletion could not be confirmed. Retry it safely.");
    } finally {
      setDeletingId("");
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const entry = pending.current ?? {
      id: editing?.id ?? crypto.randomUUID(),
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
        method: editing ? "PATCH" : "POST",
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
        setError(result.error || unconfirmed());
        return;
      }
      pending.current = null;
      setUncertain(false);
      // A moved entry leaves one period and enters another, so the reply says
      // where it went rather than implying the period on screen holds it.
      const outcome = editing ? "Entry updated" : "Entry saved";
      setSuccess(
        entry.date < current.start || entry.date > current.end
          ? `${outcome} for ${entry.date}, outside the period you are viewing. Jump to that date to see it.`
          : `${outcome}.`,
      );
      form.current?.reset();
      setKind("");
      setOpen(false);
      setEditing(null);
      await show(view);
      requestAnimationFrame(() =>
        document.getElementById("entry-status")?.focus(),
      );
    } catch {
      setUncertain(true);
      setError(unconfirmed());
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  // The date the controls step from: the pending selection, or the period the
  // server last resolved while the selection still follows today.
  const anchor = view.date ?? summary?.date ?? "";
  // The category an entry already carries stays selectable while another field
  // changes, including an archived one, as long as the chosen type reads the
  // same category list. The field is keyed by type, so choosing a type that
  // reads the other list clears the category and returning offers it again.
  const retained =
    editing?.categoryId &&
    entryKindDetail(editing.kind)?.categoryKind ===
      entryKindDetail(kind)?.categoryKind
      ? editing
      : null;
  // Only an archived category needs explaining: it is on this entry and on no
  // list of choices, so it is offered here and nowhere else.
  const archived = Boolean(
    retained &&
    !summary?.categories.some(
      (category) => category.id === retained.categoryId,
    ),
  );
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
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
          <Button
            size="lg"
            disabled={!summary || loading || saving}
            onClick={() => openForm(null)}
          >
            Add entry
          </Button>
          {/* An export belongs to the period actually loaded, and is a fresh
              export whenever that period changes. */}
          {summary && (
            <SheetsExport
              key={`${summary.kind}:${summary.start}`}
              summary={summary}
              disabled={loading || saving}
            />
          )}
        </div>
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
      {success && (
        <p role="status" id="entry-status" tabIndex={-1}>
          {success}
        </p>
      )}
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
              <h2>{editing ? "Edit entry" : "Add entry"}</h2>
            </CardTitle>
            <CardDescription>
              {editing
                ? "Correct any field of this entry. The same rules apply as when it was recorded, and every period it affects is updated."
                : "Record income, a purchase including card purchases, or a refund on the date the money moved."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              key={editing?.id ?? "new"}
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
                      defaultValue={editing?.amount}
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
                      defaultValue={editing?.date ?? summary.today}
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
                      defaultValue={retained?.categoryId ?? ""}
                    >
                      <NativeSelectOption value="">
                        Uncategorized
                      </NativeSelectOption>
                      {archived && retained && (
                        <NativeSelectOption value={retained.categoryId!}>
                          {retained.category} (archived)
                        </NativeSelectOption>
                      )}
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
                    {archived && retained && (
                      <p className="text-sm text-muted-foreground">
                        {retained.category} is archived. This entry keeps it
                        while you change another field. Replacing it offers your
                        active categories, or no category at all.
                      </p>
                    )}
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
                      defaultValue={editing?.note}
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
                      : editing
                        ? "Save changes"
                        : "Save entry"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={saving || uncertain}
                  onClick={() => {
                    setOpen(false);
                    setEditing(null);
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
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Edit ${entryTitle(entry)}`}
                          disabled={loading || saving || deletingId !== ""}
                          onClick={() => openForm(entry)}
                        >
                          Edit
                        </Button>
                        <AlertDialog
                          open={removing?.id === entry.id}
                          onOpenChange={(next) => {
                            if (deletingId) return;
                            setRemoving(next ? entry : null);
                            setRemoveError("");
                          }}
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Delete ${entryTitle(entry)}`}
                              disabled={loading || saving || deletingId !== ""}
                            >
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete this entry permanently?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {entryTitle(entry)}
                                {entry.categoryId
                                  ? `, in ${entry.category}.`
                                  : ", uncategorized."}{" "}
                                It leaves your journal and every day, week, and
                                month total that includes it. This cannot be
                                undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            {removeError && (
                              <Alert variant="destructive">
                                <AlertTitle>
                                  Deletion needs attention
                                </AlertTitle>
                                <AlertDescription>
                                  {removeError}
                                </AlertDescription>
                              </Alert>
                            )}
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={deletingId !== ""}>
                                Keep entry
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-white hover:bg-destructive/90"
                                disabled={deletingId !== ""}
                                onClick={(event) => {
                                  // The dialog closes only once the deletion is
                                  // confirmed by the server.
                                  event.preventDefault();
                                  remove(entry);
                                }}
                              >
                                {deletingId === entry.id
                                  ? "Deleting…"
                                  : "Delete permanently"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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
