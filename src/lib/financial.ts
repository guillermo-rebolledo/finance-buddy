export type CategoryKind = "income" | "expense";
export type EntryKind = "income" | "expense" | "refund";
export type Category = { id: string; kind: CategoryKind; name: string };
// A managed category also carries its lifecycle: an archived category stays on
// its existing financial movements but leaves the choices for new ones.
export type ManagedCategory = Category & { active: boolean };
export type CategoryLists = Record<CategoryKind, ManagedCategory[]>;
export const categoryKindDetails: Record<
  CategoryKind,
  { label: string; note: string }
> = {
  income: { label: "Income", note: "Where your money comes from." },
  expense: {
    label: "Expense",
    note: "Where your money goes. Refunds use these categories too.",
  },
};
export const categoryKinds = Object.keys(categoryKindDetails) as CategoryKind[];
// Unvalidated input has no descriptor.
export function categoryKindDetail(kind: string) {
  return categoryKindDetails[kind as CategoryKind];
}
// One descriptor per movement type: its label, the category list it draws from,
// and how it moves the period total it belongs to. A refund reduces expenses,
// so it reads from the owner's expense categories and carries a negative sign.
export const entryKindDetails: Record<
  EntryKind,
  {
    label: string;
    categoryKind: CategoryKind;
    total: "income" | "expenses";
    sign: bigint;
  }
> = {
  income: {
    label: "Income",
    categoryKind: "income",
    total: "income",
    sign: 1n,
  },
  expense: {
    label: "Expense",
    categoryKind: "expense",
    total: "expenses",
    sign: 1n,
  },
  refund: {
    label: "Refund",
    categoryKind: "expense",
    total: "expenses",
    sign: -1n,
  },
};
export const entryKinds = Object.keys(entryKindDetails) as EntryKind[];
// Unvalidated input and the empty form selection have no descriptor.
export function entryKindDetail(kind: string) {
  return entryKindDetails[kind as EntryKind];
}
export type Totals = { income: bigint; expenses: bigint };
export function emptyTotals(): Totals {
  return { income: 0n, expenses: 0n };
}
// A movement moves exactly one of the two running totals, by its own type's
// sign, so a refund reduces expenses the same way in a summary, a trend and a
// budget.
export function addMovement(totals: Totals, kind: EntryKind, value: bigint) {
  const detail = entryKindDetails[kind];
  totals[detail.total] += value * detail.sign;
}
// The one aggregation behind every period's total income and total expenses.
export function totalsOf(movements: { kind: string; centavos: string }[]) {
  const totals = emptyTotals();
  for (const movement of movements)
    addMovement(totals, movement.kind as EntryKind, BigInt(movement.centavos));
  return totals;
}
export type EntryInput = {
  id: string;
  kind: string;
  amount: string;
  date: string;
  categoryId: string | null;
  note: string;
};
export type Entry = EntryInput & { category: string; currency: "MXN" };
// A summary covers one kind of summary period anchored on a selected date.
// Every consumer resolves it here, so labels, totals, breakdown and rows always
// describe the same days.
export type PeriodKind = "day" | "week" | "month";
export type Period = { start: string; end: string };
export type SummaryRequest = { kind: PeriodKind; date: string };
export type Summary = SummaryRequest &
  Period & {
    today: string;
    currency: "MXN";
    income: string;
    expenses: string;
    netChange: string;
    categories: Category[];
    entries: Entry[];
    breakdown: {
      categoryId: string | null;
      category: string;
      amount: string;
    }[];
    budget: BudgetView | null;
  };
export function mexicoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
// Calendar dates are handled at UTC noon so arithmetic never crosses a day.
function atNoon(date: string) {
  return new Date(`${date}T12:00:00Z`);
}
function calendarDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function isCalendarDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "0001-01-01" &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    calendarDate(atNoon(value)) === value
  );
}
function addDays(date: string, count: number) {
  const moved = atNoon(date);
  moved.setUTCDate(moved.getUTCDate() + count);
  return calendarDate(moved);
}
function daysBetween(from: string, to: string) {
  return Math.round((atNoon(to).getTime() - atNoon(from).getTime()) / 86400000);
}
const dayName = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const boundaryName = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const monthName = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
// Axis ticks name a period in the fewest characters that stay distinct across
// one trend span: fourteen day numbers, twelve week starts, twelve months.
const dayTick = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "numeric",
});
const weekTick = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const monthTick = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
});
const weekdayName = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
});
// A budget names its days the way a person says them, "7 Sep", adding the year
// only when it is not the current one.
export function budgetDate(date: string, today: string) {
  const year = date.slice(0, 4);
  return `${atNoon(date).getUTCDate()} ${monthTick.format(atNoon(date))}${year === today.slice(0, 4) ? "" : ` ${year}`}`;
}
function budgetDay(period: Period, today: string) {
  return `${weekdayName.format(atNoon(period.start))} ${budgetDate(period.start, today)}`;
}
// A week's days, naming its month once when both ends share it: "14–20 Sep".
function budgetWeek(period: Period, today: string) {
  return period.start.slice(0, 7) === period.end.slice(0, 7)
    ? `${atNoon(period.start).getUTCDate()}–${budgetDate(period.end, today)}`
    : `${budgetDate(period.start, today)} – ${budgetDate(period.end, today)}`;
}
// One descriptor per kind of summary period: how it reads, which days it
// contains, how a step of exactly one period moves, and how it is labelled.
// Every other place asks this map instead of testing the kind again.
export const periodKindDetails: Record<
  PeriodKind,
  {
    label: string;
    current: string;
    note: string;
    // Whether a budget for the current period is also shared across its days
    // left; a day has only itself.
    hasLeftPerDay: boolean;
    containing: (date: string) => Period;
    step: (start: string, direction: 1 | -1) => string;
    name: (period: Period) => string;
    tick: (period: Period) => string;
    // How the budget form and Now name the period, such as "Week of 14–20 Sep".
    budgetLabel: (period: Period, today: string) => string;
    // How a sentence names a period other than the current one, such as "for
    // the week of 31 Aug – 6 Sep".
    budgetPhrase: (period: Period, today: string) => string;
    // How a repeating span names a period by its first day, such as "the week
    // of 7 Sep".
    spanStartName: (start: string, today: string) => string;
  }
> = {
  day: {
    label: "Day",
    current: "Today",
    note: "A day runs from midnight to midnight in Mexico City.",
    hasLeftPerDay: false,
    containing: (date) => ({ start: date, end: date }),
    step: (start, direction) => addDays(start, direction),
    name: (period) => dayName.format(atNoon(period.start)),
    tick: (period) => dayTick.format(atNoon(period.start)),
    budgetLabel: budgetDay,
    budgetPhrase: (period, today) => `on ${budgetDay(period, today)}`,
    spanStartName: budgetDate,
  },
  week: {
    label: "Week",
    current: "This week",
    note: "A week runs Monday through Sunday in Mexico City.",
    hasLeftPerDay: true,
    containing: (date) => {
      const start = addDays(date, -((atNoon(date).getUTCDay() + 6) % 7));
      // Counted from the week's own Monday, so a week may end in another month.
      return { start, end: addDays(start, 6) };
    },
    step: (start, direction) => addDays(start, direction * 7),
    name: (period) =>
      `${boundaryName.format(atNoon(period.start))} – ${boundaryName.format(atNoon(period.end))}`,
    tick: (period) => weekTick.format(atNoon(period.start)),
    budgetLabel: (period, today) => `Week of ${budgetWeek(period, today)}`,
    budgetPhrase: (period, today) =>
      `for the week of ${budgetWeek(period, today)}`,
    spanStartName: (start, today) => `the week of ${budgetDate(start, today)}`,
  },
  month: {
    label: "Month",
    current: "This month",
    note: "A month runs from its first through its last day in Mexico City.",
    hasLeftPerDay: true,
    containing: (date) => {
      const start = atNoon(date);
      start.setUTCDate(1);
      const end = atNoon(date);
      // Day zero of the next month is this month's last day, whatever its length.
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
      return { start: calendarDate(start), end: calendarDate(end) };
    },
    step: (start, direction) => {
      const moved = atNoon(start);
      moved.setUTCMonth(moved.getUTCMonth() + direction, 1);
      return calendarDate(moved);
    },
    name: (period) => monthName.format(atNoon(period.start)),
    tick: (period) => monthTick.format(atNoon(period.start)),
    budgetLabel: (period) => monthName.format(atNoon(period.start)),
    budgetPhrase: (period) => `for ${monthName.format(atNoon(period.start))}`,
    spanStartName: (start) => monthName.format(atNoon(start)),
  },
};
export const periodKinds = Object.keys(periodKindDetails) as PeriodKind[];
// Unvalidated input and an unknown selection have no descriptor.
export function periodKindDetail(value: string) {
  return periodKindDetails[value as PeriodKind];
}
export function summaryPeriod(kind: PeriodKind, date: string) {
  return periodKindDetails[kind].containing(date);
}
// Aligns any date to the first day of its period: the date itself, its week's
// Monday, or its month's 1st.
export function periodStart(kind: PeriodKind, date: string) {
  return summaryPeriod(kind, date).start;
}
// Stepping starts from the period's own first day, so month lengths, year
// boundaries and weeks spanning months all move by exactly one period.
export function shiftPeriod(kind: PeriodKind, date: string, direction: 1 | -1) {
  return periodKindDetails[kind].step(periodStart(kind, date), direction);
}
export function periodLabel(kind: PeriodKind, period: Period) {
  return periodKindDetails[kind].name(period);
}
// A trend reads several consecutive summary periods at once. The span ends with
// the period the selection resolves to, so the dashboard's charts and its
// figures always describe the same calendar boundaries.
export const trendLength: Record<PeriodKind, number> = {
  day: 14,
  week: 12,
  month: 12,
};
export type TrendPoint = Period & {
  label: string;
  tick: string;
  income: string;
  expenses: string;
  netChange: string;
};
// One spending group across a whole span, beside the same group across the span
// immediately before it, so a category reads as rising or falling rather than as
// a bare figure.
export type TrendCategory = {
  categoryId: string | null;
  category: string;
  amount: string;
  previous: string;
};
export type Trend = SummaryRequest &
  Period & {
    today: string;
    currency: "MXN";
    length: number;
    points: TrendPoint[];
    previous: Period;
    income: string;
    expenses: string;
    netChange: string;
    previousIncome: string;
    previousExpenses: string;
    categories: TrendCategory[];
  };
// Past this many spending groups a chart stops being readable, so the remainder
// is folded into one group rather than given more bars.
export const trendCategoryLimit = 6;
export const trendCategoryFold = "Other categories";
// The consecutive periods a span covers, oldest first, ending with the period
// containing the selected date.
export function trendPeriods(kind: PeriodKind, date: string): Period[] {
  const periods = [summaryPeriod(kind, date)];
  while (periods.length < trendLength[kind])
    periods.unshift(
      summaryPeriod(kind, shiftPeriod(kind, periods[0].start, -1)),
    );
  return periods;
}
export function spanOf(periods: Period[]): Period {
  return { start: periods[0].start, end: periods[periods.length - 1].end };
}
// The equally long span immediately before this one, which every comparison on
// the dashboard is measured against.
export function previousSpan(kind: PeriodKind, periods: Period[]): Period {
  return spanOf(
    trendPeriods(kind, shiftPeriod(kind, periods[0].start, -1)),
  );
}
// The landing view, and the fallback for anything a request leaves out.
export function currentWeek(today: string): SummaryRequest {
  return { kind: "week", date: today };
}
// Rejects anything a summary period cannot be resolved from.
export function parseSummaryRequest(
  kind: string | null,
  date: string | null,
  today: string,
): SummaryRequest | null {
  const fallback = currentWeek(today);
  const requested = kind ?? fallback.kind;
  if (!periodKindDetail(requested)) return null;
  if (date !== null && !isCalendarDate(date)) return null;
  return { kind: requested as PeriodKind, date: date ?? fallback.date };
}
export function centavos(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function decimal(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
function groupThousands(whole: string) {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
export function money(amount: string) {
  const negative = amount.startsWith("-");
  const [whole, fraction] = (negative ? amount.slice(1) : amount).split(".");
  return `${negative ? "-" : ""}MXN ${groupThousands(whole)}.${fraction}`;
}
// An amount as it's being typed, cents first: each digit enters on the right
// and shifts the others left, so typing 1, 2, 3 reads 0.01, 0.12, 1.23. Only
// digits count, up to the most amountPattern allows, and thousands are grouped
// with commas.
export function formatAmountInput(text: string) {
  const digits = text
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 14);
  if (digits === "") return "";
  const cents = digits.padStart(3, "0");
  return `${groupThousands(cents.slice(0, -2))}.${cents.slice(-2)}`;
}
// Pasted text is read as pesos rather than as digits typed one by one, so a
// copied "1,234.5" stays MXN 1,234.50.
export function pastedAmountInput(text: string) {
  const [whole, fraction = ""] = text.replace(/[^\d.]/g, "").split(".");
  if (!/\d/.test(whole + fraction)) return "";
  return formatAmountInput(`${whole}${fraction.slice(0, 2).padEnd(2, "0")}`);
}
// The amount a formatted field holds, in the Amount format the API accepts.
export function plainAmount(text: string) {
  return text.replaceAll(",", "").trim();
}
// Axis ticks carry magnitude only; the tooltip and the table view beside every
// chart carry the exact figure.
export function compactAmount(amount: string) {
  const negative = amount.startsWith("-");
  const pesos = Number(negative ? amount.slice(1) : amount);
  const [scale, suffix] =
    pesos >= 1_000_000
      ? [1_000_000, "M"]
      : pesos >= 1_000
        ? [1_000, "K"]
        : [1, ""];
  const scaled = pesos / scale;
  const text =
    suffix === "" || scaled >= 100
      ? String(Math.round(scaled))
      : scaled.toFixed(1).replace(/\.0$/, "");
  return `${negative ? "-" : ""}${text}${suffix}`;
}
// Refunds are entered as positive amounts and presented as reductions.
export function signedAmount(entry: { kind: string; amount: string }) {
  return entryKindDetail(entry.kind)?.sign === -1n
    ? `-${entry.amount}`
    : entry.amount;
}
// One sentence naming a movement by its type, amount and movement date, so the
// edit control, the delete confirmation and its announcement always describe the
// same entry.
export function entryTitle(entry: {
  kind: string;
  amount: string;
  date: string;
}) {
  return `${entryKindDetail(entry.kind)?.label ?? entry.kind} of ${money(entry.amount)} on ${entry.date}`;
}
// Net change reads as a direction, so a period that gained money shows its sign.
export function signedMoney(amount: string) {
  return amount.startsWith("-") || centavos(amount) === 0n
    ? money(amount)
    : `+${money(amount)}`;
}
// Google's per-file scope: the app reaches only the spreadsheets it creates,
// never the rest of the owner's Drive. The connect control and the server-side
// token check name the same scope.
export const sheetsScope = "https://www.googleapis.com/auth/drive.file";
// Up to 12 whole digits and two decimal places, the most a stored amount holds.
export const amountPattern = /^\d{1,12}(\.\d{1,2})?$/;
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type EntryError = { field: keyof EntryInput | null; message: string };
export function validateEntry(
  input: unknown,
  today: string,
): EntryError | null {
  if (!input || typeof input !== "object")
    return { field: null, message: "Enter a valid financial movement." };
  const entry = input as EntryInput;
  const target = validateEntryTarget(input);
  if (target) return target;
  if (typeof entry.kind !== "string" || !entryKindDetail(entry.kind))
    return { field: "kind", message: "Choose income, expense, or refund." };
  if (
    typeof entry.amount !== "string" ||
    !amountPattern.test(entry.amount) ||
    centavos(entry.amount) <= 0n
  )
    return {
      field: "amount",
      message:
        "Enter an amount greater than zero with up to two decimal places (maximum 999,999,999,999.99).",
    };
  if (!isCalendarDate(entry.date) || entry.date > today)
    return {
      field: "date",
      message: "Choose a valid movement date today or earlier in Mexico City.",
    };
  if (
    entry.categoryId !== null &&
    (typeof entry.categoryId !== "string" ||
      !uuidPattern.test(entry.categoryId))
  )
    return { field: "categoryId", message: "Choose an available category." };
  if (typeof entry.note !== "string" || entry.note.length > 2000)
    return { field: "note", message: "Keep the note within 2,000 characters." };
  return null;
}

export const entryMissing =
  "We couldn't find that entry. Refresh to see the latest version of this period.";
// Editing and deletion name an existing entry; only its identifier is read from
// the request, and ownership always comes from the session.
export function validateEntryTarget(input: unknown): EntryError | null {
  const id = (input as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !uuidPattern.test(id))
    return {
      field: "id",
      message: "We couldn't recognize that entry. Reload the page and try again.",
    };
  return null;
}
// The same refusal whether an entry is being created or corrected: a category
// must be active and drawn from the movement type's own list. A correction may
// additionally keep the archived category the entry already carries.
export function categoryRefusal(kind: string): EntryError {
  return {
    field: "categoryId",
    message:
      kind === "refund"
        ? "Choose an active expense category for this refund, or leave it uncategorized."
        : "Choose an active category that matches this entry type.",
  };
}

// A budget view: one period's budget beside that period's total expenses and
// what remains. The dashboard and every budget reply share this shape.
export type BudgetView = Period & {
  kind: PeriodKind;
  amount: string;
  repeats: boolean;
  expenses: string;
  remaining: string;
  overBudget: boolean;
  daysLeft: number | null;
  leftPerDay: string | null;
};
// The one calculation behind every budget figure. The remaining budget is
// signed and never clamped, so refunds can lift it above the budget, and a
// period is over budget only once its total expenses exceed the budget.
// Left per day describes what remains for the current week or month, today
// included, so a day, an ended or future period, or an overspent one has none.
// It rounds down to the centavo, so following it never goes over budget.
export function budgetFigures(
  budget: { amount: bigint; repeats: boolean },
  kind: PeriodKind,
  period: Period,
  expenses: bigint,
  today: string,
): BudgetView {
  const remaining = budget.amount - expenses;
  const daysLeft =
    periodKindDetails[kind].hasLeftPerDay &&
    period.start <= today &&
    today <= period.end &&
    remaining >= 0n
      ? daysBetween(today, period.end) + 1
      : null;
  return {
    kind,
    start: period.start,
    end: period.end,
    amount: decimal(budget.amount),
    repeats: budget.repeats,
    expenses: decimal(expenses),
    remaining: decimal(remaining),
    overBudget: remaining < 0n,
    daysLeft,
    leftPerDay:
      daysLeft === null ? null : decimal(remaining / BigInt(daysLeft)),
  };
}
// The Budgets page: the budgets in effect today for each kind of period, then
// the repeating spans, one-off budgets for future periods, and a page of ended
// periods that had a budget.
export type BudgetList = {
  today: string;
  currency: "MXN";
  now: Record<PeriodKind, BudgetView | null>;
  repeating: {
    kind: PeriodKind;
    start: string;
    amount: string;
    until: string | null;
  }[];
  upcoming: BudgetView[];
  past: BudgetView[];
  nextBefore: string | null;
};
// An overspent period reads as the excess, never as a negative remaining budget,
// and an ended period reads as how it ended.
export function budgetStanding(budget: BudgetView, ended = false) {
  return budget.overBudget
    ? `Over by ${money(budget.remaining.slice(1))}`
    : ended
      ? `Under by ${money(budget.remaining)}`
      : `${money(budget.remaining)} left`;
}
// The line an entry's confirmation carries about the budget it counts against,
// naming the period it landed in: "MXN 1,240.00 left this week", or "Over by
// MXN 300.00 for the week of 31 Aug – 6 Sep" for an entry in another period.
export function budgetLine(budget: BudgetView, today: string) {
  const detail = periodKindDetails[budget.kind];
  return `${budgetStanding(budget)} ${
    budget.start <= today && today <= budget.end
      ? detail.current.toLowerCase()
      : detail.budgetPhrase(budget, today)
  }`;
}
// Left per day reads as what is still available, never as what should already
// have been spent.
export function leftPerDayText(budget: BudgetView) {
  if (budget.leftPerDay === null || budget.daysLeft === null) return null;
  return {
    amount: `${money(budget.leftPerDay)} left per day`,
    days:
      budget.daysLeft === 1
        ? "Today is the last day"
        : `${budget.daysLeft} days left, counting today`,
  };
}
// A period has ended once its last day is before today in Mexico City. Its
// budget is then history: it still reports how the period went, but nothing
// sets, changes or stops it.
export function periodHasEnded(period: Period, today: string) {
  return period.end < today;
}
// Where a budget comes from, as every list and card labels it.
export function budgetSource(budget: { repeats: boolean }) {
  return budget.repeats ? "Repeating" : "One-off";
}
// How a repeating span reads, from the start of its first period through the
// start of its last, when it has one: "From the week of 7 Sep".
export function spanLabel(
  span: { kind: PeriodKind; start: string; until: string | null },
  today: string,
) {
  const name = periodKindDetails[span.kind].spanStartName;
  return `From ${name(span.start, today)}${span.until === null ? "" : ` through ${name(span.until, today)}`}`;
}
export type BudgetInput = { amount: string; oneOff: boolean };
export type BudgetError = { field: keyof BudgetInput | null; message: string };
// A budget amount follows the Amount format but may be zero, so a period can be
// planned with no spending at all.
export function validateBudget(input: unknown): BudgetError | null {
  if (!input || typeof input !== "object")
    return { field: null, message: "Enter a budget amount." };
  const budget = input as Record<string, unknown>;
  if (typeof budget.amount !== "string" || !amountPattern.test(budget.amount))
    return {
      field: "amount",
      message:
        "Enter an amount of zero or more with up to two decimal places (maximum 999,999,999,999.99).",
    };
  if (typeof budget.oneOff !== "boolean")
    return { field: "oneOff", message: "Choose whether this budget repeats." };
  return null;
}
// Removing a budget names how far it reaches: "period" removes the named
// period's one-off budget, and "onward" stops the repeating budget from it.
export type BudgetRemoval = { scope: "period" | "onward" };
export type BudgetRemovalError = {
  field: keyof BudgetRemoval | null;
  message: string;
};
export function validateBudgetRemoval(
  input: unknown,
): BudgetRemovalError | null {
  if (!input || typeof input !== "object")
    return { field: null, message: "Choose which budget to remove." };
  const { scope } = input as Record<string, unknown>;
  if (scope !== "period" && scope !== "onward")
    return {
      field: "scope",
      message:
        "Choose to remove this period's one-off budget or stop the repeating budget from this period.",
    };
  return null;
}
// Past budgets arrive a page at a time, newest period end first and day before
// week before month on the same end. A page's cursor names its last period by
// that order, "2026-09-06_week", and the next page continues after it.
export type PastCursor = { end: string; kind: PeriodKind };
export function pastCursor(view: { end: string; kind: PeriodKind }) {
  return `${view.end}_${view.kind}`;
}
export function parsePastCursor(value: string): PastCursor | null {
  const [end, kind, ...rest] = value.split("_");
  return !rest.length &&
    isCalendarDate(end) &&
    periodKinds.includes(kind as PeriodKind)
    ? { end, kind: kind as PeriodKind }
    : null;
}

// One descriptor per category change: how the control reads while idle, busy and
// done, whether it names a category and whether it targets an existing one.
export type CategoryAction = "create" | "rename" | "archive" | "restore";
export const categoryActionDetails: Record<
  CategoryAction,
  {
    label: string;
    pending: string;
    done: string;
    named: boolean;
    targeted: boolean;
  }
> = {
  create: {
    label: "Add",
    pending: "Adding…",
    done: "Category added.",
    named: true,
    targeted: false,
  },
  rename: {
    label: "Save name",
    pending: "Saving…",
    done: "Category renamed.",
    named: true,
    targeted: true,
  },
  archive: {
    label: "Archive",
    pending: "Archiving…",
    done: "Category archived. It's still on your older entries and totals.",
    named: false,
    targeted: true,
  },
  restore: {
    label: "Restore",
    pending: "Restoring…",
    done: "Category restored.",
    named: false,
    targeted: true,
  },
};
export function categoryActionDetail(action: string) {
  return categoryActionDetails[action as CategoryAction];
}
export type CategoryChange =
  | { action: "create"; kind: CategoryKind; name: string; id?: string }
  | { action: "rename"; id: string; name: string }
  | { action: "archive" | "restore"; id: string };
export type CategoryError = {
  field: "action" | "kind" | "id" | "name" | null;
  message: string;
};
// Bounded naming policy: a category name is trimmed, holds at least one visible
// character, stays within 40 characters and carries no line breaks or other
// control characters. Uniqueness is case-insensitive within one list and counts
// archived categories, so a name is restored rather than recreated.
export const categoryNameLimit = 40;
export function categoryName(name: string) {
  return name.trim();
}
export const categoryNameRule = `Enter a name of 1 to ${categoryNameLimit} characters.`;
export const categoryNameTaken =
  "That name is already in this list. Rename the existing category or restore it from the archive.";
export const categoryMissing =
  "We couldn't find that category. Reload the page and try again.";
export const categoryIdentifierTaken =
  "That category conflicts with one already in your journal. Reload the page and try again.";
export function validateCategoryChange(input: unknown): CategoryError | null {
  if (!input || typeof input !== "object")
    return { field: null, message: "Choose a change to make." };
  const change = input as Record<string, unknown>;
  const detail =
    typeof change.action === "string"
      ? categoryActionDetail(change.action)
      : undefined;
  if (!detail) return { field: "action", message: "Choose a change to make." };
  if (
    detail.targeted &&
    (typeof change.id !== "string" || !uuidPattern.test(change.id))
  )
    return { field: "id", message: categoryMissing };
  // A creation may name its own identifier, so a retry after a lost reply
  // finds the category it already created rather than a taken name.
  if (
    !detail.targeted &&
    change.id !== undefined &&
    (typeof change.id !== "string" || !uuidPattern.test(change.id))
  )
    return {
      field: "id",
      message: "We couldn't recognize that category. Reload the page and try again.",
    };
  if (!detail.targeted && !categoryKindDetail(change.kind as string))
    return { field: "kind", message: "Choose the income or expense list." };
  if (detail.named) {
    const name =
      typeof change.name === "string" ? categoryName(change.name) : "";
    if (!name || name.length > categoryNameLimit || /\p{C}/u.test(name))
      return { field: "name", message: categoryNameRule };
  }
  return null;
}
