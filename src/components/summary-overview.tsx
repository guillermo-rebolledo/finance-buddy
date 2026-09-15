"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { EllipsisIcon, PencilIcon, Plus, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  budgetLine,
  entryKindDetail,
  entryKinds,
  entryKindDetails,
  entryTitle,
  money,
  plainAmount,
  signedAmount,
  validateEntry,
  type Entry,
  type EntryInput,
  type Summary,
} from "@/lib/financial";
import { AmountInput } from "@/components/amount-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [kind, setKind] = useState("");
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<EntryInput | null>(null);
  const inFlight = useRef(false);
  const [invalidField, setInvalidField] = useState<keyof EntryInput | null>(
    null,
  );
  const fieldProps = (name: string) => ({
    "aria-invalid": invalidField === name,
  });
  // What an unconfirmed write means depends on the write: a recording could be
  // duplicated by a replacement, a correction only writes the same values again.
  const unconfirmed = () =>
    editing
      ? "We didn't get confirmation that your changes were saved. It's safe to retry with the same values."
      : "We didn't get confirmation that this entry was saved. Retry the same entry to avoid a duplicate.";
  const form = useRef<HTMLFormElement>(null);
  // Every refusal is announced once, as a notification; the form keeps its
  // values and marks the field at fault, if any.
  const refuse = (message: string) => toast.error(message);
  // The control pressed is gone once the form closes or the row leaves, so focus
  // moves to the list the outcome changed instead of falling to the body.
  const focusEntries = () =>
    requestAnimationFrame(() =>
      document.getElementById("entries-heading")?.focus(),
    );
  // One place opens the form for either purpose, on a period just reloaded, so
  // no stale message, marked field or previous entry's values survive into it.
  async function openForm(entry: Entry | null) {
    if (!(await show(view))) return;
    pending.current = null;
    setUncertain(false);
    setEditing(entry);
    setKind(entry?.kind ?? "");
    setInvalidField(null);
    setOpen(true);
    requestAnimationFrame(() => document.getElementById("kind")?.focus());
  }
  // Deletion is permanent, so it happens only from the confirmation and only
  // once while pending.
  async function remove(entry: Entry) {
    if (deletingId) return;
    setDeletingId(entry.id);
    try {
      const response = await fetch("/api/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        refuse(
          result.error ||
            "We couldn't confirm that this entry was deleted. Try deleting it again.",
        );
        return;
      }
      setRemoving(null);
      if (editing?.id === entry.id) {
        setOpen(false);
        setEditing(null);
      }
      toast.success(`Deleted ${entryTitle(entry)}.`);
      await show(view);
      focusEntries();
    } catch {
      refuse("We couldn't confirm that this entry was deleted. Try deleting it again.");
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
      amount: plainAmount(String(data.get("amount") ?? "")),
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
      refuse(
        "We couldn't check today's date. Your entry is still here. Try again once the page loads.",
      );
      inFlight.current = false;
      setSaving(false);
      return;
    }
    const invalid = validateEntry(entry, current.today);
    if (invalid) {
      inFlight.current = false;
      setSaving(false);
      refuse(invalid.message);
      setInvalidField(invalid.field);
      // The field at fault takes focus, so the owner lands where the fix goes.
      if (invalid.field)
        requestAnimationFrame(() =>
          document.getElementById(invalid.field!)?.focus(),
        );
      return;
    }
    pending.current = entry;
    inFlight.current = true;
    setSaving(true);
    setInvalidField(null);
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
        refuse(result.error || unconfirmed());
        return;
      }
      pending.current = null;
      setUncertain(false);
      // A moved entry leaves one period and enters another, so the reply says
      // where it went rather than implying the period on screen holds it.
      // An expense or refund's reply carries the budget it counts against.
      const outcome = editing ? "Entry updated" : "Entry saved";
      toast.success(
        `${
          entry.date < current.start || entry.date > current.end
            ? `${outcome} for ${entry.date}, outside the period you are viewing. Jump to that date to see it.`
            : `${outcome}.`
        }${result.budget ? ` ${budgetLine(result.budget, current.today)}.` : ""}`,
      );
      form.current?.reset();
      setKind("");
      setOpen(false);
      setEditing(null);
      await show(view);
      focusEntries();
    } catch {
      setUncertain(true);
      refuse(unconfirmed());
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
                ? "Fix any detail below. We'll update every day, week, and month that includes this entry."
                : "Add income, spending, or a refund on the date the money moved."}
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
                        Enter a positive amount. We&apos;ll subtract it from
                        expenses on the date you received the refund.
                      </FieldDescription>
                    )}
                  </Field>
                  <Field data-invalid={invalidField === "amount"}>
                    <FieldLabel htmlFor="amount">Amount (MXN)</FieldLabel>
                    <AmountInput
                      id="amount"
                      name="amount"
                      {...fieldProps("amount")}
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
                        {retained.category} is archived, but this entry can keep
                        it. If you switch categories, you can choose an active
                        one or leave it uncategorized.
                      </FieldDescription>
                    )}
                    {kind === "refund" && (
                      <FieldDescription>
                        Refunds use expense categories. Pick an active one, or
                        leave this refund uncategorized.
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
              <h2 id="entries-heading" tabIndex={-1} className="outline-none">
                Entries
              </h2>
            </CardTitle>
            <CardDescription>Newest movement date first.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.entries.length ? (
              // One row per entry, read left to right like a table without
              // its grid: what it is, when and why, how much, and its actions.
              <ul className="divide-y">
                {summary.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    {/* What the entry is and how much leads; where it belongs,
                        when it moved and why follow beneath it. */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">
                          {entryKindDetail(entry.kind)?.label ?? entry.kind}
                        </span>
                        <span className="shrink-0 text-base font-semibold tabular-nums">
                          {money(signedAmount(entry))}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Badge variant="secondary" size="lg">
                          {entry.category}
                        </Badge>
                        <time
                          className="text-sm text-muted-foreground tabular-nums"
                          dateTime={entry.date}
                        >
                          {entry.date}
                        </time>
                      </div>
                      {entry.note && (
                        <p
                          className="truncate text-sm text-muted-foreground"
                          title={entry.note}
                        >
                          {entry.note}
                        </p>
                      )}
                    </div>
                    <div className="-mt-1 -mr-2 flex">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${entryTitle(entry)}`}
                            disabled={loading || saving || deletingId !== ""}
                          >
                            <EllipsisIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openForm(entry)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setRemoving(entry)}
                          >
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Nothing here yet</EmptyTitle>
                  <EmptyDescription>
                    Add income, an expense, or a refund. You can also browse a
                    different day, week, or month.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      )}
      {/* One confirmation serves every row, since a row's menu closes as soon
          as Delete is chosen. */}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (deletingId || next) return;
          setRemoving(null);
        }}
      >
        {removing && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
              <AlertDialogDescription>
                {entryTitle(removing)}
                {removing.categoryId
                  ? `, in ${removing.category}.`
                  : ", uncategorized."}{" "}
                This removes it from your journal and recalculates every total
                that includes it. You can&apos;t undo this.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingId !== ""}>
                Keep entry
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deletingId !== ""}
                onClick={(event) => {
                  // The dialog closes only once the deletion is confirmed by
                  // the server.
                  event.preventDefault();
                  remove(removing);
                }}
              >
                {deletingId === removing.id ? "Deleting…" : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </main>
  );
}
