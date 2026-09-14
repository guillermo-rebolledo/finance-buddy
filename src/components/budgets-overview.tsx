"use client";
import { useRef, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  budgetDate,
  isCalendarDate,
  money,
  periodKindDetails,
  periodKinds,
  validateBudget,
  type BudgetList,
  type PeriodKind,
  type Summary,
} from "@/lib/financial";
import { PageHeader } from "@/components/page-header";
import { BudgetFigures } from "@/components/budget-figures";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
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

const unconfirmed = "The budget could not be confirmed. Retry it safely.";

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

// Budgets are set and read here: the budgets in effect today, and the form
// that sets a repeating budget for any current or future period.
export function BudgetsOverview({ initial }: { initial: BudgetList | null }) {
  const [list, setList] = useState(initial);
  const [loadError, setLoadError] = useState(!initial);
  const [loading, setLoading] = useState(false);
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
      toast.error("Could not open the budget form. Please retry.");
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
      aria-busy={loading || opening}
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
          Plan your spending for a day, week, or month and see how much is left.
        </p>
        <p>Mexico City · MXN</p>
      </PageHeader>
      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Budgets unavailable</AlertTitle>
          <AlertDescription>
            We could not load your budgets.
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
          <section aria-label="Now" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2
                id="now-heading"
                tabIndex={-1}
                className="text-xl font-semibold tracking-tight"
              >
                Now
              </h2>
              <p className="text-sm text-muted-foreground">
                Today, this week, and this month in Mexico City.
              </p>
            </div>
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
                              {budget.repeats ? "Repeating" : "One-off"}
                            </Badge>
                          </CardAction>
                        )}
                      </CardHeader>
                      {budget ? (
                        <CardContent>
                          <div className="flex flex-col gap-4">
                            <BudgetFigures budget={budget} />
                          </div>
                        </CardContent>
                      ) : (
                        <div className="mt-auto">
                          <CardFooter>
                            <Button
                              variant="outline"
                              disabled={opening}
                              onClick={() => openForm(kind, list.today)}
                            >
                              Set budget
                            </Button>
                          </CardFooter>
                        </div>
                      )}
                    </Card>
                  </section>
                );
              })}
            </div>
          </section>
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
                A budget is the most you intend to spend in a day, week, or
                month. It is measured against that period&apos;s total
                expenses, so refunds give room back and income never adds to
                it. It repeats every period until you change it.
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

// Sets a repeating budget for the period chosen. Every choice of kind or date
// is resolved by the server before the form describes it, and a period that has
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
  // amount and the saved budget always agree.
  const [period, setPeriod] = useState(initial);
  const [amount, setAmount] = useState(initial.budget?.amount ?? "");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(false);
  const [invalid, setInvalid] = useState("");
  const [saving, setSaving] = useState(false);
  const requested = useRef(0);
  const noun = periodKindDetails[period.kind].label.toLowerCase();
  const ended = period.end < period.today;

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
    if (saving) return;
    const input = { amount: amount.trim(), oneOff: false };
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
      toast.success(
        result.budget
          ? `Budget of ${money(result.budget.amount)} saved for every ${noun} from ${budgetDate(result.budget.start, period.today)}.`
          : "Budget saved.",
      );
      await onSaved();
    } catch {
      toast.error(unconfirmed);
    } finally {
      setSaving(false);
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
            The budget applies to the period you choose and every one after
            it, until you change it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={save}
            noValidate
            aria-busy={resolving || saving}
            className="flex flex-col gap-6"
          >
            <fieldset disabled={saving} className="min-w-0">
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
                    {periodKindDetails[period.kind].budgetLabel(
                      period,
                      period.today,
                    )}
                  </p>
                  {resolveError && (
                    <p className="text-sm text-destructive">
                      Could not check that period. Choose it again to retry.
                    </p>
                  )}
                </div>
                {ended && (
                  <Alert>
                    <AlertTitle>This {noun} has ended</AlertTitle>
                    <AlertDescription>
                      Its budget stays as it was. Choose today or a later date
                      to set a budget.
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
                      The most you intend to spend. Zero plans a {noun} with no
                      spending.
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                size="lg"
                disabled={
                  saving || resolving || ended || !isCalendarDate(date)
                }
              >
                {saving ? "Saving…" : "Save budget"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={saving}
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
