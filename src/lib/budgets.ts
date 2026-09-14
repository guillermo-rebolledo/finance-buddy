import "server-only";
import type { PoolClient } from "pg";
import { database } from "./database";
import {
  budgetFigures,
  decimal,
  mexicoToday,
  pastCursor,
  periodKinds,
  periodStart,
  shiftPeriod,
  summaryPeriod,
  totalsOf,
  type BudgetList,
  type BudgetView,
  type PastCursor,
  type Period,
  type PeriodKind,
  type SummaryRequest,
} from "./financial";

export type StoredBudget = { centavos: string; repeats: boolean };
// The budget for one period is resolved when it is read: the period's one-off
// budget if it has one, otherwise the repeating span containing it. The
// embedding statement names the placeholders, so a summary resolves its budget
// from the same snapshot as its totals.
export function periodBudgetQuery(owner: string, kind: string, start: string) {
  return `SELECT amount_centavos::text AS centavos, repeats FROM budget
    WHERE owner_id=${owner} AND period_kind=${kind}
    AND first_period_start <= ${start}::date
    AND (last_period_start IS NULL OR last_period_start >= ${start}::date)
    ORDER BY repeats LIMIT 1`;
}
export function budgetOf(
  stored: StoredBudget | null,
  kind: PeriodKind,
  period: Period,
  expenses: bigint,
  today: string,
): BudgetView | null {
  return stored
    ? budgetFigures(
        { amount: BigInt(stored.centavos), repeats: stored.repeats },
        kind,
        period,
        expenses,
        today,
      )
    : null;
}
type PeriodOfKind = Period & { kind: PeriodKind };
type PeriodFigures = PeriodOfKind & {
  centavos: string | null;
  repeats: boolean | null;
  movements: { kind: string; centavos: string }[];
};
// Budget views for many periods from one statement: each period's budget,
// resolved as periodBudgetQuery resolves it, beside its movements summed per
// type, which totalsOf turns into total expenses exactly as a summary does.
// `periods` selects kind, start and end, and may use $1, the owner.
function periodFiguresQuery(periods: string) {
  return `SELECT p.kind, to_char(p.start,'YYYY-MM-DD') AS start,
    to_char(p."end",'YYYY-MM-DD') AS "end", b.centavos, b.repeats,
    COALESCE((SELECT json_agg(m) FROM (
      SELECT kind, sum(amount_centavos)::text AS centavos FROM financial_movement
      WHERE owner_id=$1 AND movement_date BETWEEN p.start AND p."end"
      GROUP BY kind
    ) m), '[]') AS movements
  FROM (${periods}) p
  LEFT JOIN LATERAL (${periodBudgetQuery("$1", "p.kind", "p.start")}) b ON true`;
}
function viewOf(figures: PeriodFigures, today: string) {
  return budgetOf(
    figures.centavos === null ? null : (figures as StoredBudget),
    figures.kind,
    figures,
    totalsOf(figures.movements).expenses,
    today,
  );
}
// The budget views of the periods named, in the order named, each null
// without a budget.
async function viewsFor(owner: string, periods: PeriodOfKind[], today: string) {
  const { rows } = await database().query<PeriodFigures>(
    periodFiguresQuery(
      `SELECT * FROM json_to_recordset($2::json) AS p(kind text, start date, "end" date)`,
    ),
    [owner, JSON.stringify(periods)],
  );
  return periods.map(({ kind, start }) =>
    viewOf(rows.find((row) => row.kind === kind && row.start === start)!, today),
  );
}
// The day, week and month containing a date, shortest first.
function periodsOn(date: string): PeriodOfKind[] {
  return periodKinds.map((kind) => ({ kind, ...summaryPeriod(kind, date) }));
}
export async function budgetView(owner: string, request: SummaryRequest) {
  const [view] = await viewsFor(
    owner,
    [{ kind: request.kind, ...summaryPeriod(request.kind, request.date) }],
    mexicoToday(),
  );
  return view;
}
// The budget an expense or refund counts against: that of the shortest period
// containing its movement date that has a budget, or null when none does.
export async function entryBudget(owner: string, date: string) {
  const views = await viewsFor(owner, periodsOn(date), mexicoToday());
  return views.find(Boolean) ?? null;
}
// Kinds sort day, week, month wherever periods of different kinds meet.
const kindRank = (kind: string) =>
  `array_position(ARRAY[${periodKinds.map((name) => `'${name}'`).join(",")}], ${kind})`;
// A period's last day from its kind and first day, mirroring
// periodKindDetails' `containing` in SQL, which cannot ask the map. Kind names
// double as PostgreSQL interval units ('1 day', '1 week', '1 month') where
// periods are stepped through below.
const periodEnd = (kind: string, start: string) =>
  `(CASE ${kind} WHEN 'day' THEN ${start} WHEN 'week' THEN ${start} + 6
    ELSE (${start} + interval '1 month')::date - 1 END)`;
export const pastPageSize = 20;
// Today's day, week and month, each with its budget; the repeating spans still
// in effect or scheduled; one-off budgets for future periods; and a page of
// ended periods that had a budget, after `before` when given.
export async function listBudgets(
  owner: string,
  before: PastCursor | null = null,
): Promise<BudgetList> {
  const today = mexicoToday();
  const periods = periodsOn(today);
  const views = await viewsFor(owner, periods, today);
  const { rows: upcoming } = await database().query<PeriodFigures>(
    `${periodFiguresQuery(
      `SELECT period_kind AS kind, first_period_start AS start,
        ${periodEnd("period_kind", "first_period_start")} AS "end"
      FROM budget WHERE owner_id=$1 AND NOT repeats AND first_period_start > $2::date`,
    )} ORDER BY p.start, ${kindRank("p.kind")}`,
    [owner, today],
  );
  // Every period a budget row covered, one-off or repeating, listed once and
  // capped at today, since a period starting later has not ended. One more
  // than a page is read to tell whether another page follows.
  const { rows: past } = await database().query<PeriodFigures>(
    `${periodFiguresQuery(
      `SELECT g.kind, g.start, e."end" FROM (
        SELECT DISTINCT b.period_kind AS kind, s.start::date AS start
        FROM budget b CROSS JOIN LATERAL generate_series(
          b.first_period_start::timestamp,
          LEAST(COALESCE(b.last_period_start, $2::date), $2::date)::timestamp,
          ('1 ' || b.period_kind)::interval) AS s(start)
        WHERE b.owner_id=$1
      ) g CROSS JOIN LATERAL (SELECT ${periodEnd("g.kind", "g.start")} AS "end") e
      WHERE e."end" < $2::date AND ($3::date IS NULL OR e."end" < $3::date
        OR (e."end" = $3::date AND ${kindRank("g.kind")} > ${kindRank("$4::text")}))
      ORDER BY e."end" DESC, ${kindRank("g.kind")} LIMIT ${pastPageSize + 1}`,
    )} ORDER BY p."end" DESC, ${kindRank("p.kind")}`,
    [owner, today, before?.end ?? null, before?.kind ?? null],
  );
  const pastViews = past
    .slice(0, pastPageSize)
    .map((figures) => viewOf(figures, today))
    .filter((view) => view !== null);
  const now = Object.fromEntries(
    periods.map(({ kind }, index) => [kind, views[index]]),
  ) as BudgetList["now"];
  const { rows: spans } = await database().query<{
    kind: PeriodKind;
    start: string;
    centavos: string;
    until: string | null;
  }>(
    `SELECT period_kind AS kind, to_char(first_period_start,'YYYY-MM-DD') AS start,
      amount_centavos::text AS centavos, to_char(last_period_start,'YYYY-MM-DD') AS until
    FROM budget WHERE owner_id=$1 AND repeats ORDER BY first_period_start`,
    [owner],
  );
  // A span whose last period started before its kind's current period has
  // ended and belongs to history.
  const current = Object.fromEntries(
    periods.map(({ kind, start }) => [kind, start]),
  );
  const repeating = spans
    .filter(({ kind, until }) => until === null || until >= current[kind])
    .sort((a, b) => periodKinds.indexOf(a.kind) - periodKinds.indexOf(b.kind))
    .map(({ kind, start, centavos, until }) => ({
      kind,
      start,
      amount: decimal(BigInt(centavos)),
      until,
    }));
  return {
    today,
    currency: "MXN",
    now,
    repeating,
    upcoming: upcoming
      .map((figures) => viewOf(figures, today))
      .filter((view) => view !== null),
    past: pastViews,
    nextBefore:
      past.length > pastPageSize ? pastCursor(pastViews.at(-1)!) : null,
  };
}
// Every budget change runs in one transaction, and changes to one owner's
// budgets of one kind are serialized, so spans are read and rewritten without
// another change interleaving. `apply` receives the owner, kind and period
// start as the statement parameters $1–$3. The reply is the budget that then applies to the named
// period, read after the change commits, so it describes what was kept.
async function changeBudgets(
  owner: string,
  request: SummaryRequest,
  apply: (client: PoolClient, params: string[], start: string) => Promise<void>,
) {
  const start = periodStart(request.kind, request.date);
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`budget:${owner}:${request.kind}`],
    );
    await apply(client, [owner, request.kind, start], start);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return budgetView(owner, request);
}
// Sets the repeating amount from one period onward. A span starting there takes
// the new amount. A span that started earlier is closed at the period before,
// and the new amount continues to that span's own end, so a later scheduled
// change survives. Otherwise the new span runs until the period before the
// next later span, or stays open. A one-off budget on that period gives way;
// one-off budgets elsewhere are untouched. Applying the same request again
// leaves the same budgets.
export function setRepeatingBudget(
  owner: string,
  request: SummaryRequest,
  amount: bigint,
) {
  const { kind } = request;
  return changeBudgets(owner, request, async (client, params, start) => {
    const {
      rows: [containing],
    } = await client.query(
      `SELECT to_char(first_period_start,'YYYY-MM-DD') AS first,
        to_char(last_period_start,'YYYY-MM-DD') AS last
      FROM budget WHERE owner_id=$1 AND period_kind=$2 AND repeats
      AND first_period_start <= $3::date
      AND (last_period_start IS NULL OR last_period_start >= $3::date)`,
      params,
    );
    if (containing?.first === start)
      await client.query(
        `UPDATE budget SET amount_centavos=$4, updated_at=now()
        WHERE owner_id=$1 AND period_kind=$2 AND repeats
        AND first_period_start=$3::date AND amount_centavos<>$4`,
        [...params, amount.toString()],
      );
    else {
      let until: string | null;
      if (containing) {
        until = containing.last;
        await client.query(
          `UPDATE budget SET last_period_start=$4::date, updated_at=now()
          WHERE owner_id=$1 AND period_kind=$2 AND repeats
          AND first_period_start=$3::date`,
          [owner, kind, containing.first, shiftPeriod(kind, start, -1)],
        );
      } else {
        const {
          rows: [next],
        } = await client.query(
          `SELECT to_char(min(first_period_start),'YYYY-MM-DD') AS first
          FROM budget WHERE owner_id=$1 AND period_kind=$2 AND repeats
          AND first_period_start > $3::date`,
          params,
        );
        until = next.first && shiftPeriod(kind, next.first, -1);
      }
      await client.query(
        `INSERT INTO budget(owner_id, period_kind, first_period_start,
          last_period_start, repeats, amount_centavos)
        VALUES ($1,$2,$3::date,$4::date,true,$5)`,
        [...params, until, amount.toString()],
      );
    }
    await client.query(
      `DELETE FROM budget WHERE owner_id=$1 AND period_kind=$2 AND NOT repeats
      AND first_period_start=$3::date`,
      params,
    );
  });
}
// Sets or replaces one period's one-off budget, which takes precedence over the
// repeating budget for that period only.
export function setOneOffBudget(
  owner: string,
  request: SummaryRequest,
  amount: bigint,
) {
  return changeBudgets(owner, request, async (client, params) => {
    await client.query(
      `INSERT INTO budget(owner_id, period_kind, first_period_start,
        last_period_start, repeats, amount_centavos)
      VALUES ($1,$2,$3::date,$3::date,false,$4)
      ON CONFLICT (owner_id, period_kind, repeats, first_period_start)
      DO UPDATE SET amount_centavos=EXCLUDED.amount_centavos, updated_at=now()
      WHERE budget.amount_centavos<>EXCLUDED.amount_centavos`,
      [...params, amount.toString()],
    );
  });
}
// Removes one period's one-off budget, so the repeating budget, if any,
// applies to that period again. Removing one that does not exist changes
// nothing.
export function removeOneOffBudget(owner: string, request: SummaryRequest) {
  return changeBudgets(owner, request, async (client, params) => {
    await client.query(
      `DELETE FROM budget WHERE owner_id=$1 AND period_kind=$2 AND NOT repeats
      AND first_period_start=$3::date`,
      params,
    );
  });
}
// Stops repeating from one period: every span starting there or later goes,
// which removes the scheduled changes, and a span that started earlier ends at
// the period before. Ended periods keep their budgets and one-off budgets are
// untouched, so stopping again, or when nothing repeats, changes nothing.
export function stopRepeatingBudget(owner: string, request: SummaryRequest) {
  return changeBudgets(owner, request, async (client, params, start) => {
    await client.query(
      `DELETE FROM budget WHERE owner_id=$1 AND period_kind=$2 AND repeats
      AND first_period_start >= $3::date`,
      params,
    );
    await client.query(
      `UPDATE budget SET last_period_start=$4::date, updated_at=now()
      WHERE owner_id=$1 AND period_kind=$2 AND repeats
      AND (last_period_start IS NULL OR last_period_start >= $3::date)`,
      [...params, shiftPeriod(request.kind, start, -1)],
    );
  });
}
