"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  entryKindDetail,
  entryKinds,
  entryKindDetails,
  entryTitle,
  money,
  signedAmount,
  validateEntry,
  type Entry,
  type EntryInput,
  type Summary,
} from "@/lib/financial";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  PeriodNavigation,
  PeriodUnavailable,
  usePeriodView,
} from "@/components/period-view";

// A list option cannot have an empty value, so leaving an entry uncategorized
// is its own option and becomes no category when the form is read.
const uncategorized = "uncategorized";

// The registry is where movements are recorded, corrected and removed: one
// period's entries as a compact list, and nothing that summarizes them. Totals,
// category figures and trends live on the dashboard.
export function SummaryOverview({ initial }: { initial: Summary | null }) {
  const { summary, view, anchor, loading, loadError, show, loaded, title, requestedLabel } =
    usePeriodView({ summary: initial, trend: null }, false, "Your entries");
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
      categoryId:
        [uncategorized, ""].includes(String(data.get("categoryId") ?? ""))
          ? null
          : String(data.get("categoryId")),
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
  return (
    <main
      aria-busy={loading}
      className="flex flex-col gap-6 py-6 sm:gap-8 sm:py-10"
    >
      <PageHeader
        title={title}
        actions={
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={!summary || loading || saving}
            onClick={() => openForm(null)}
          >
            <Plus aria-hidden="true" />
            Add entry
          </Button>
        }
      >
        <p className="text-base tabular-nums">
          {summary ? `${summary.start} – ${summary.end}` : "No period loaded"}
        </p>
        <p>
          Mexico City · MXN ·{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            href="/dashboard"
          >
            Totals and trends
          </Link>
        </p>
      </PageHeader>
      <PeriodNavigation
        view={view}
        anchor={anchor}
        loading={loading}
        loaded={loaded}
        onShow={show}
      />
      {success && (
        <p role="status" id="entry-status" tabIndex={-1}>
          {success}
        </p>
      )}
      {loadError && (
        <PeriodUnavailable
          requestedLabel={requestedLabel}
          summary={summary}
          loading={loading}
          onRetry={() => show(view)}
        />
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
                    <Select name="kind" value={kind} onValueChange={setKind}>
                      <SelectTrigger
                        id="kind"
                        className="w-full"
                        {...fieldProps("kind")}
                      >
                        <SelectValue placeholder="Choose a type" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {entryKinds.map((available) => (
                          <SelectItem key={available} value={available}>
                            {entryKindDetails[available].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {kind === "refund" && (
                      <FieldDescription>
                        Enter the refunded amount as a positive number. It
                        reduces expenses on its receipt date.
                      </FieldDescription>
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
                    <FieldDescription>
                      Today or earlier in Mexico City.
                    </FieldDescription>
                  </Field>
                  <Field data-invalid={invalidField === "categoryId"}>
                    <FieldLabel htmlFor="categoryId">
                      Category (optional)
                    </FieldLabel>
                    <Select
                      key={kind}
                      name="categoryId"
                      defaultValue={retained?.categoryId ?? uncategorized}
                    >
                      <SelectTrigger
                        id="categoryId"
                        className="w-full"
                        {...fieldProps("categoryId")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value={uncategorized}>
                          Uncategorized
                        </SelectItem>
                        {archived && retained && (
                          <SelectItem value={retained.categoryId!}>
                            {retained.category} (archived)
                          </SelectItem>
                        )}
                        {summary.categories
                          .filter(
                            (category) =>
                              category.kind ===
                              entryKindDetail(kind)?.categoryKind,
                          )
                          .map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {archived && retained && (
                      <FieldDescription>
                        {retained.category} is archived. This entry keeps it
                        while you change another field. Replacing it offers your
                        active categories, or no category at all.
                      </FieldDescription>
                    )}
                    {kind === "refund" && (
                      <FieldDescription>
                        Refunds use your active expense categories. An archived
                        category stays archived; leave the refund uncategorized
                        instead.
                      </FieldDescription>
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
                    className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium break-words">
                          {entryKindDetail(entry.kind)?.label ?? entry.kind} ·{" "}
                          {entry.category}
                        </span>
                        <time
                          className="text-sm text-muted-foreground"
                          dateTime={entry.date}
                        >
                          {entry.date}
                        </time>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">
                        {money(signedAmount(entry))}
                      </span>
                    </div>
                    {entry.note && (
                      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {entry.note}
                      </p>
                    )}
                    <div className="-ml-2 flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${entryTitle(entry)}`}
                        disabled={loading || saving || deletingId !== ""}
                        onClick={() => openForm(entry)}
                      >
                        <Pencil aria-hidden="true" />
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
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Delete ${entryTitle(entry)}`}
                            disabled={loading || saving || deletingId !== ""}
                          >
                            <Trash2 aria-hidden="true" />
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
                              <AlertTitle>Deletion needs attention</AlertTitle>
                              <AlertDescription>{removeError}</AlertDescription>
                            </Alert>
                          )}
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={deletingId !== ""}>
                              Keep entry
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className={buttonVariants({
                                variant: "destructive",
                              })}
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
                    Add income, an expense, or a refund, or browse another day,
                    week, or month.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
