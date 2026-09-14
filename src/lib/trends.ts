import "server-only";
import { database } from "./database";
import {
  addMovement,
  decimal,
  emptyTotals,
  entryKindDetails,
  mexicoToday,
  periodKindDetails,
  periodLabel,
  previousSpan,
  spanOf,
  summaryPeriod,
  trendCategoryFold,
  trendCategoryLimit,
  trendPeriods,
  type EntryKind,
  type SummaryRequest,
  type Trend,
} from "./financial";

type Group = {
  categoryId: string | null;
  category: string;
  now: bigint;
  before: bigint;
};

// One trend covers the consecutive periods ending with the selected one, and the
// equally long span immediately before it. Both are read from a single statement
// so the charts and the comparison beside them never come from different
// snapshots of the journal.
export async function trendReport(
  owner: string,
  request: SummaryRequest,
): Promise<Trend> {
  const today = mexicoToday();
  const periods = trendPeriods(request.kind, request.date);
  const span = spanOf(periods);
  const previous = previousSpan(request.kind, periods);
  const { rows } = await database().query(
    `SELECT m.kind, m.amount_centavos::text AS centavos,
      to_char(m.movement_date,'YYYY-MM-DD') AS date,
      m.category_id AS "categoryId", COALESCE(c.name,'Uncategorized') AS category
    FROM financial_movement m
    LEFT JOIN category c ON c.id=m.category_id AND c.owner_id=m.owner_id
    WHERE m.owner_id=$1 AND m.movement_date BETWEEN $2::date AND $3::date`,
    [owner, previous.start, span.end],
  );
  // Each period is keyed by its own first day, and a movement is placed by the
  // period containing its movement date, so the same calendar boundaries apply
  // here as in a summary and every movement lands in exactly one bucket.
  const buckets = new Map(periods.map((period) => [period.start, emptyTotals()]));
  const current = emptyTotals();
  const earlier = emptyTotals();
  const groups = new Map<string | null, Group>();
  for (const row of rows as {
    kind: EntryKind;
    centavos: string;
    date: string;
    categoryId: string | null;
    category: string;
  }[]) {
    const value = BigInt(row.centavos);
    const detail = entryKindDetails[row.kind];
    const within = row.date >= span.start;
    addMovement(within ? current : earlier, row.kind, value);
    if (within)
      addMovement(
        buckets.get(summaryPeriod(request.kind, row.date).start)!,
        row.kind,
        value,
      );
    // Only spending is grouped by category: income sources answer a different
    // question and would double the bars without comparing anything.
    if (detail.total !== "expenses") continue;
    const group = groups.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      category: row.category,
      now: 0n,
      before: 0n,
    };
    const effect = value * detail.sign;
    if (within) group.now += effect;
    else group.before += effect;
    groups.set(row.categoryId, group);
  }
  const ranked = [...groups.values()].sort(
    (left, right) =>
      Number(right.now - left.now) ||
      left.category.localeCompare(right.category),
  );
  // The tail keeps its figures rather than disappearing: it becomes one group
  // that still reconciles with the span's total expenses. A single leftover
  // group is simply itself; folding one category would only rename it.
  const folded = ranked.slice(trendCategoryLimit);
  const listed =
    folded.length > 1
      ? [
          ...ranked.slice(0, trendCategoryLimit),
          folded.reduce<Group>(
            (total, group) => ({
              ...total,
              now: total.now + group.now,
              before: total.before + group.before,
            }),
            {
              categoryId: null,
              category: trendCategoryFold,
              now: 0n,
              before: 0n,
            },
          ),
        ]
      : ranked;
  return {
    ...request,
    ...span,
    today,
    currency: "MXN",
    length: periods.length,
    previous,
    points: periods.map((period) => {
      const totals = buckets.get(period.start)!;
      return {
        ...period,
        label: periodLabel(request.kind, period),
        tick: periodKindDetails[request.kind].tick(period),
        income: decimal(totals.income),
        expenses: decimal(totals.expenses),
        netChange: decimal(totals.income - totals.expenses),
      };
    }),
    income: decimal(current.income),
    expenses: decimal(current.expenses),
    netChange: decimal(current.income - current.expenses),
    previousIncome: decimal(earlier.income),
    previousExpenses: decimal(earlier.expenses),
    categories: listed.map((group) => ({
      categoryId: group.categoryId,
      category: group.category,
      amount: decimal(group.now),
      previous: decimal(group.before),
    })),
  };
}
