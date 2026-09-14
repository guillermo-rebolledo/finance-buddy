"use client";
import { useRef, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  budgetDate,
  budgetSource,
  budgetStanding,
  isCalendarDate,
  money,
  periodHasEnded,
  periodKindDetails,
  periodKinds,
  spanLabel,
  validateBudget,
  type BudgetList,
  type BudgetRemoval,
  type BudgetView,
  type PeriodKind,
  type Summary,
} from "@/lib/financial";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { BudgetFigures } from "@/components/budget-figures";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const unconfirmed =
  "We didn't get confirmation that your budget was saved. It's safe to try again.";

// The period a budget form names, as the server resolved it: its kind, the
// date chosen, its first and last day, today, and the budget that applies.
// A summary reply carries all of it, so the form never computes a period.
async function resolvePeriod(kind: PeriodKind, date: string) {
  const response = await fetch(
    `/api/journal?${new URLSearchParams({ kind, date })}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error();
  return (await response.json()) as Summary;
}

// Removes a period's one-off budget or stops repeating from it, announcing any
// refusal. Resolves to the budget that then applies to the period, or to
// undefined when the change was not confirmed.
async function removeBudget(
  kind: PeriodKind,
  date: string,
  scope: BudgetRemoval["scope"],
): Promise<BudgetView | null | undefined> {
  try {
    const response = await fetch(
      `/api/budgets?${new URLSearchParams({ kind, date })}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      },
    );
    const result = await response.json();
    if (response.ok) return result.budget;
    toast.error(result.error || unconfirmed);
  } catch {
    toast.error(unconfirmed);
  }
}
// Removes a period's one-off budget and says what applies to it now. Resolves
// to whether the removal was confirmed.
async function removeOneOff(kind: PeriodKind, date: string) {
  const applies = await removeBudget(kind, date, "period");
  if (applies === undefined) return false;
  toast.success(
    applies
      ? `One-off budget removed. Your ${money(applies.amount)} repeating budget is back in place.`
      : "One-off budget removed.",
  );
  return true;
}

// Budgets are set and read here: the budgets in effect today, the repeating
// budgets with their scheduled changes, upcoming one-off budgets, how ended
// periods went, and the form that sets a budget for any current or future
// period.
export function BudgetsOverview({ initial }: { initial: BudgetList | null }) {
  const [list, setList] = useState(initial);
  const [loadError, setLoadError] = useState(!initial);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // The period the form opened on, already resolved; a new key per opening, so
  // no earlier amount or refusal survives into it.
  const [form, setForm] = useState<{ key: number; period: Summary } | null>(
    null,
  );
  const [opening, setOpening] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/budgets", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setList(await response.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }
  // Past arrives a page at a time; each page continues after the last.
  async function showMore() {
    if (!list?.nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/budgets?${new URLSearchParams({ before: list.nextBefore })}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const next: BudgetList = await response.json();
      setList(
        (current) =>
          current && {
            ...current,
            past: [...current.past, ...next.past],
            nextBefore: next.nextBefore,
          },
      );
    } catch {
      toast.error("We couldn't load more past budgets. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }
  async function openForm(kind: PeriodKind, date: string) {
    if (opening) return;
    setOpening(true);
    try {
      const period = await resolvePeriod(kind, date);
      setForm((current) => ({ key: (current?.key ?? 0) + 1, period }));
      requestAnimationFrame(() =>
        document.getElementById("budget-amount")?.focus(),
      );
    } catch {
      toast.error("We couldn't open the budget form. Try again.");
    } finally {
      setOpening(false);
    }
  }
  async function saved() {
    setForm(null);
    await load();
    requestAnimationFrame(() => document.getElementById("now-heading")?.focus());
  }
  const hasBudgets = Boolean(
    list &&
      (periodKinds.some((kind) => list.now[kind]) ||
        list.repeating.length ||
        list.upcoming.length ||
        list.past.length),
  );
  return (
    <main
      aria-busy={loading || opening || loadingMore}
      className="flex flex-col gap-6 py-6 sm:gap-8 sm:py-10"
    >
      <PageHeader
        title="Budgets"
        actions={
          hasBudgets &&
          list && (
            <Button
              size="lg"
              disabled={opening}
              onClick={() => openForm("week", list.today)}
            >
              <Plus aria-hidden="true" />
              Set budget
            </Button>
          )
        }
      >
        <p className="max-w-2xl">
          Set a spending target for a day, week, or month. We&apos;ll keep track of
          what&apos;s left.
        </p>
        <p>Mexico City · MXN</p>
      </PageHeader>
      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t load your budgets</AlertTitle>
          <AlertDescription>
            Your budgets aren&apos;t available right now.
            <Button variant="outline" disabled={loading} onClick={load}>
              {loading ? "Loading…" : "Retry budgets"}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {form && (
        <BudgetForm
          key={form.key}
          initial={form.period}
          onCancel={() => setForm(null)}
          onSaved={saved}
        />
      )}
      {list &&
        (hasBudgets ? (
          <>
            <section aria-label="Now" className="flex flex-col gap-4">
              <SectionHeading
                id="now-heading"
                title="Now"
                note="A quick look at today, this week, and this month."
              />
              <div className="grid gap-4 lg:grid-cols-3">
                {periodKinds.map((kind) => {
                  const detail = periodKindDetails[kind];
                  const budget = list.now[kind];
                  return (
                    // A one-cell grid stretches the card, so the three periods
                    // stand equally tall side by side.
                    <section
                      key={kind}
                      aria-label={detail.current}
                      className="grid"
                    >
                      <Card>
                        <CardHeader>
                          <CardTitle>
                            <h3>{detail.current}</h3>
                          </CardTitle>
                          <CardDescription>
                            {budget
                              ? detail.budgetLabel(budget, list.today)
                              : `No budget for this ${detail.label.toLowerCase()}.`}
                          </CardDescription>
                          {budget && (
                            <CardAction>
                              <Badge variant="secondary">
                                {budgetSource(budget)}
                              </Badge>
                            </CardAction>
                          )}
                        </CardHeader>
                        {budget && (
                          <CardContent>
                            <div className="flex flex-col gap-4">
                              <BudgetFigures budget={budget} today={list.today} />
                            </div>
                          </CardContent>
                        )}
                        <div className="mt-auto">
                          <CardFooter>
                            <Button
                              variant="outline"
                              disabled={opening}
                              onClick={() => openForm(kind, list.today)}
                            >
                              {budget ? "Change" : "Set budget"}
                            </Button>
                          </CardFooter>
                        </div>
                      </Card>
                    </section>
                  );
                })}
              </div>
            </section>
            {list.repeating.length > 0 && (
              <RepeatingBudgets
                list={list}
                opening={opening}
                onChange={openForm}
                onStopped={load}
              />
            )}
            {list.upcoming.length > 0 && (
              <UpcomingBudgets
                list={list}
                opening={opening}
                onChange={openForm}
                onRemoved={load}
              />
            )}
            {list.past.length > 0 && (
              <PastBudgets
                list={list}
                loadingMore={loadingMore}
                onMore={showMore}
              />
            )}
          </>
        ) : (
          <Card>
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Wallet aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No budgets yet</EmptyTitle>
                  <EmptyDescription>
                    Pick the most you want to spend in a day, week, or month.
                    Refunds give you room back, while income stays out of the
                    calculation. Your budget repeats unless you make it a
                    one-off.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    disabled={opening}
                    onClick={() => openForm("week", list.today)}
                  >
                    Set your first budget
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ))}
    </main>
  );
}

function SectionHeading({
  id,
  title,
  note,
}: {
  id?: string;
  title: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2
        id={id}
        tabIndex={id ? -1 : undefined}
        className="text-xl font-semibold tracking-tight"
      >
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

type Span = BudgetList["repeating"][number];

// One row per repeating span, so a scheduled change reads as a row of its own.
// A span that started earlier is changed or stopped from today's period, and
// a scheduled one from its own first period.
function RepeatingBudgets({
  list,
  opening,
  onChange,
  onStopped,
}: {
  list: BudgetList;
  opening: boolean;
  onChange: (kind: PeriodKind, date: string) => void;
  onStopped: () => Promise<void>;
}) {
  const [stopping, setStopping] = useState<Span | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (span: Span) =>
    span.start > list.today ? span.start : list.today;
  const fromText = (span: Span) =>
    span.start > list.today
      ? periodKindDetails[span.kind].spanStartName(span.start, list.today)
      : periodKindDetails[span.kind].current.toLowerCase();

  async function stop(span: Span) {
    if (busy) return;
    setBusy(true);
    try {
      if ((await removeBudget(span.kind, from(span), "onward")) === undefined)
        return;
      toast.success(
        `${periodKindDetails[span.kind].label} budget stopped from ${fromText(span)}.`,
      );
      setStopping(null);
      await onStopped();
    } finally {
      setBusy(false);
    }
  }
  const noun = stopping && periodKindDetails[stopping.kind].label.toLowerCase();
  return (
    <section aria-label="Repeating" className="flex flex-col gap-4">
      <SectionHeading
        title="Repeating"
        note="These keep going until you change or stop them. Future changes show here too."
      />
      <Card>
        <CardContent>
          <ul className="divide-y">
            {list.repeating.map((span) => (
              <li
                key={`${span.kind}:${span.start}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="break-all font-medium tabular-nums">
                    {money(span.amount)} every{" "}
                    {periodKindDetails[span.kind].label.toLowerCase()}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {spanLabel(span, list.today)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={opening}
                    onClick={() => onChange(span.kind, from(span))}
                  >
                    Change
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStopping(span)}
                  >
                    Stop
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <AlertDialog
        open={stopping !== null}
        onOpenChange={(next) => {
          if (busy || next) return;
          setStopping(null);
        }}
      >
        {stopping && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Stop the repeating {noun} budget?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your repeating {noun} budget will end {fromText(stopping)}.
                We&apos;ll also remove any changes scheduled after that. Past and
                one-off budgets won&apos;t change.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep budget</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={(event) => {
                  // The dialog closes only once the server confirms the stop.
                  event.preventDefault();
                  stop(stopping);
                }}
              >
                {busy ? "Stopping…" : "Stop budget"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  );
}

// One-off budgets for future periods, each opened in the form to change it or
// removed so the repeating budget, if any, applies to its period again.
function UpcomingBudgets({
  list,
  opening,
  onChange,
  onRemoved,
}: {
  list: BudgetList;
  opening: boolean;
  onChange: (kind: PeriodKind, date: string) => void;
  onRemoved: () => Promise<void>;
}) {
  const [removing, setRemoving] = useState("");
  async function remove(budget: BudgetView) {
    if (removing) return;
    setRemoving(`${budget.kind}:${budget.start}`);
    try {
      if (await removeOneOff(budget.kind, budget.start)) await onRemoved();
    } finally {
      setRemoving("");
    }
  }
  return (
    <section aria-label="Upcoming one-offs" className="flex flex-col gap-4">
      <SectionHeading
        title="Upcoming one-offs"
        note="A different budget for one future day, week, or month."
      />
      <Card>
        <CardContent>
          <ul className="divide-y">
            {list.upcoming.map((budget) => {
              const key = `${budget.kind}:${budget.start}`;
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">
                      {periodKindDetails[budget.kind].budgetLabel(
                        budget,
                        list.today,
                      )}
                    </span>
                    <span className="break-all text-sm text-muted-foreground tabular-nums">
                      {money(budget.amount)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={opening}
                      onClick={() => onChange(budget.kind, budget.start)}
                    >
                      Change
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={removing !== ""}
                      onClick={() => remove(budget)}
                    >
                      {removing === key ? "Removing…" : "Remove"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

// Ended periods that had a budget, newest first and read-only, each saying
// whether it ended under or over.
function PastBudgets({
  list,
  loadingMore,
  onMore,
}: {
  list: BudgetList;
  loadingMore: boolean;
  onMore: () => void;
}) {
  return (
    <section aria-label="Past" className="flex flex-col gap-4">
      <SectionHeading
        title="Past"
        note="Finished periods, newest first."
      />
      <Card>
        <CardContent>
          <ul className="divide-y">
            {list.past.map((budget) => (
              <li
                key={`${budget.kind}:${budget.start}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {periodKindDetails[budget.kind].budgetLabel(
                        budget,
                        list.today,
                      )}
                    </span>
                    <Badge variant="secondary">
                      {budgetSource(budget)}
                    </Badge>
                  </span>
                  <span className="break-all text-sm text-muted-foreground tabular-nums">
                    Budget {money(budget.amount)} · Total expenses{" "}
                    {money(budget.expenses)}
                  </span>
                </div>
                <span
                  className={cn(
                    "break-all font-medium tabular-nums",
                    budget.overBudget && "text-destructive",
                  )}
                >
                  {budgetStanding(budget, true)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
        {list.nextBefore && (
          <CardFooter>
            <Button variant="outline" disabled={loadingMore} onClick={onMore}>
              {loadingMore ? "Loading…" : "Show more"}
            </Button>
          </CardFooter>
        )}
      </Card>
    </section>
  );
}

// Sets a budget for the period chosen: repeating from it by default, or for
// that period only when One-off is ticked. Every choice of kind or date is
// resolved by the server before the form describes it, and a period that has
// ended cannot be saved, since its budget stays as it was.
function BudgetForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Summary;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState(initial.kind);
  const [date, setDate] = useState(initial.date);
  // Everything the form says about the period comes from the period last
  // resolved, and saving names that same period, so the label, the prefilled
  // amount, One-off and the saved budget always agree.
  const [period, setPeriod] = useState(initial);
  const [amount, setAmount] = useState(initial.budget?.amount ?? "");
  const [oneOff, setOneOff] = useState(initial.budget?.repeats === false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(false);
  const [invalid, setInvalid] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const requested = useRef(0);
  const detail = periodKindDetails[period.kind];
  const noun = detail.label.toLowerCase();
  const ended = periodHasEnded(period, period.today);
  const busy = saving || removing;

  async function choose(nextKind: PeriodKind, nextDate: string) {
    setKind(nextKind);
    setDate(nextDate);
    if (!isCalendarDate(nextDate)) return;
    const sequence = ++requested.current;
    setResolving(true);
    try {
      const resolved = await resolvePeriod(nextKind, nextDate);
      // A slower earlier choice must not replace the period now chosen.
      if (sequence !== requested.current) return;
      setPeriod(resolved);
      setAmount(resolved.budget?.amount ?? "");
      // A period with a one-off budget opens that budget, not a second one.
      setOneOff(resolved.budget?.repeats === false);
      setInvalid("");
      setResolveError(false);
    } catch {
      if (sequence === requested.current) setResolveError(true);
    } finally {
      if (sequence === requested.current) setResolving(false);
    }
  }
  function refuse(message: string) {
    setInvalid(message);
    requestAnimationFrame(() =>
      document.getElementById("budget-amount")?.focus(),
    );
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input = { amount: amount.trim(), oneOff };
    const refused = validateBudget(input);
    if (refused) return refuse(refused.message);
    setSaving(true);
    setInvalid("");
    try {
      const response = await fetch(
        `/api/budgets?${new URLSearchParams({ kind: period.kind, date: period.date })}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (result.field === "amount") refuse(result.error);
        else toast.error(result.error || unconfirmed);
        return;
      }
      const budget: BudgetView | null = result.budget;
      toast.success(
        !budget
          ? "Budget saved."
          : oneOff
            ? `One-off budget of ${money(budget.amount)} saved ${detail.budgetPhrase(budget, period.today)}.`
            : `Budget of ${money(budget.amount)} saved for every ${noun} from ${budgetDate(budget.start, period.today)}.`,
      );
      await onSaved();
    } catch {
      toast.error(unconfirmed);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (busy) return;
    setRemoving(true);
    try {
      if (await removeOneOff(period.kind, period.date)) await onSaved();
    } finally {
      setRemoving(false);
    }
  }
  return (
    <section aria-label="Set budget">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Set budget</h2>
          </CardTitle>
          <CardDescription>
            {oneOff
              ? "Use this budget for the selected period only. It replaces any repeating budget for that period."
              : "Start with the selected period and keep using this budget until you change it."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={save}
            noValidate
            aria-busy={resolving || busy}
            className="flex flex-col gap-6"
          >
            <fieldset disabled={busy} className="min-w-0">
              <FieldGroup>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="budget-kind">Period</FieldLabel>
                    <Select
                      value={kind}
                      onValueChange={(next) => choose(next as PeriodKind, date)}
                    >
                      <SelectTrigger id="budget-kind">
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
                    <FieldLabel htmlFor="budget-date">Date</FieldLabel>
                    <Input
                      id="budget-date"
                      type="date"
                      value={date}
                      onChange={(event) => choose(kind, event.target.value)}
                    />
                  </Field>
                </div>
                <div
                  aria-live="polite"
                  className="flex flex-col gap-0.5 rounded-md border bg-muted/50 p-3"
                >
                  <p className="text-sm text-muted-foreground">Budgeting</p>
                  <p className="font-medium">
                    {detail.budgetLabel(period, period.today)}
                  </p>
                  {resolveError && (
                    <p className="text-sm text-destructive">
                      We couldn&apos;t check that period. Choose it again to retry.
                    </p>
                  )}
                </div>
                {ended && (
                  <Alert>
                    <AlertTitle>This {noun} has ended</AlertTitle>
                    <AlertDescription>
                      Its budget is locked in. Choose today or a later date to
                      set a new one.
                    </AlertDescription>
                  </Alert>
                )}
                <Field data-invalid={Boolean(invalid)}>
                  <FieldLabel htmlFor="budget-amount">Amount (MXN)</FieldLabel>
                  <Input
                    id="budget-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    aria-invalid={Boolean(invalid)}
                    aria-describedby={
                      invalid ? "budget-amount-error" : undefined
                    }
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  {invalid ? (
                    <FieldError id="budget-amount-error">{invalid}</FieldError>
                  ) : (
                    <FieldDescription>
                      The most you want to spend. Enter 0 if you don&apos;t plan to
                      spend anything this {noun}.
                    </FieldDescription>
                  )}
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="budget-one-off"
                    checked={oneOff}
                    onCheckedChange={(checked) => setOneOff(checked === true)}
                  />
                  <FieldLabel htmlFor="budget-one-off">
                    One-off (this period only)
                  </FieldLabel>
                </Field>
              </FieldGroup>
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                size="lg"
                disabled={busy || resolving || ended || !isCalendarDate(date)}
              >
                {saving ? "Saving…" : "Save budget"}
              </Button>
              {period.budget?.repeats === false && !ended && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={busy || resolving}
                  onClick={remove}
                >
                  {removing ? "Removing…" : "Remove one-off"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={busy}
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
