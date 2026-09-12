export type CategoryKind = "income" | "expense";
export type EntryKind = "income" | "expense" | "refund";
export type Category = { id: string; kind: CategoryKind; name: string };
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
export type EntryInput = {
  id: string;
  kind: string;
  amount: string;
  date: string;
  categoryId: string | null;
  note: string;
};
export type Entry = EntryInput & { category: string; currency: "MXN" };
// A summary covers one granularity anchored on a selected date; every consumer
// reads the same resolved period, so labels, totals, breakdown and rows agree.
export type Granularity = "day" | "week" | "month";
export const granularityDetails: Record<
  Granularity,
  { label: string; current: string; note: string }
> = {
  day: {
    label: "Day",
    current: "Today",
    note: "A day runs from midnight to midnight in Mexico City.",
  },
  week: {
    label: "Week",
    current: "This week",
    note: "A week runs Monday through Sunday in Mexico City.",
  },
  month: {
    label: "Month",
    current: "This month",
    note: "A month runs from its first through its last day in Mexico City.",
  },
};
export const granularities = Object.keys(granularityDetails) as Granularity[];
// Unvalidated input has no descriptor.
export function granularityDetail(value: string) {
  return granularityDetails[value as Granularity];
}
export type Period = { start: string; end: string };
export type PeriodRequest = { granularity: Granularity; date: string };
export type PeriodReport = PeriodRequest &
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
// The one place a granularity becomes concrete start/end dates.
export function periodContaining(
  granularity: Granularity,
  date: string,
): Period {
  const start = atNoon(date);
  const end = atNoon(date);
  if (granularity === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    // Counted from the week's own Monday, so a week may end in the next month.
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  } else if (granularity === "month") {
    start.setUTCDate(1);
    // Day zero of the following month is this month's last day, whatever its length.
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  return { start: calendarDate(start), end: calendarDate(end) };
}
// Stepping moves from the period's own start, so month lengths, year boundaries
// and weeks spanning months all advance by exactly one period.
export function shiftPeriod(
  granularity: Granularity,
  date: string,
  direction: 1 | -1,
) {
  const moved = atNoon(periodContaining(granularity, date).start);
  if (granularity === "month")
    moved.setUTCMonth(moved.getUTCMonth() + direction, 1);
  else
    moved.setUTCDate(
      moved.getUTCDate() + direction * (granularity === "week" ? 7 : 1),
    );
  return calendarDate(moved);
}
const dayLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const boundaryLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const monthLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
export function periodLabel(granularity: Granularity, period: Period) {
  if (granularity === "day") return dayLabel.format(atNoon(period.start));
  if (granularity === "month") return monthLabel.format(atNoon(period.start));
  return `${boundaryLabel.format(atNoon(period.start))} – ${boundaryLabel.format(atNoon(period.end))}`;
}
// Rejects anything a period cannot be resolved from; absent parts mean the
// current week in Mexico City, which stays the landing view.
export function parsePeriodRequest(
  granularity: string | null,
  date: string | null,
  today: string,
): PeriodRequest | null {
  const resolved = granularity ?? "week";
  if (!granularityDetail(resolved)) return null;
  if (date !== null && !isCalendarDate(date)) return null;
  return { granularity: resolved as Granularity, date: date ?? today };
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
export function money(amount: string) {
  const negative = amount.startsWith("-");
  const [whole, fraction] = (negative ? amount.slice(1) : amount).split(".");
  return `${negative ? "-" : ""}MXN ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
// Refunds are entered as positive amounts and presented as reductions.
export function signedAmount(entry: { kind: string; amount: string }) {
  return entryKindDetail(entry.kind)?.sign === -1n
    ? `-${entry.amount}`
    : entry.amount;
}
// Net change reads as a direction, so a period that gained money shows its sign.
export function signedMoney(amount: string) {
  return amount.startsWith("-") || centavos(amount) === 0n
    ? money(amount)
    : `+${money(amount)}`;
}
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
  if (typeof entry.id !== "string" || !uuidPattern.test(entry.id))
    return {
      field: "id",
      message: "Invalid entry identifier. Reload and try again.",
    };
  if (typeof entry.kind !== "string" || !entryKindDetail(entry.kind))
    return { field: "kind", message: "Choose income, expense, or refund." };
  if (
    typeof entry.amount !== "string" ||
    !/^\d{1,12}(\.\d{1,2})?$/.test(entry.amount) ||
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
