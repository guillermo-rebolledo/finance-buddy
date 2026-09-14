import "server-only";
import type { PoolClient } from "pg";
import { database } from "./database";
import {
  budgetFigures,
  decimal,
  mexicoToday,
  pastCursor,
  periodHasEnded,
  periodKinds,
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
// budget if it has one, otherwise the repeating span containing it. Repeating
// spans never overlap, so only the latest one starting by that period can
// contain it. Each is one lookup on the primary key, however many budgets came
// before. The embedding statement names the placeholders, so a summary
// resolves its budget from the same snapshot as its totals.
export function periodBudgetQuery(owner: string, kind: string, start: string) {
  return `SELECT centavos, repeats FROM (
      (SELECT amount_centavos::text AS centavos, repeats, 0 AS precedence
      FROM budget WHERE owner_id=${owner} AND period_kind=${kind}
        AND NOT repeats AND first_period_start = ${start}::date)
      UNION ALL
      (SELECT centavos, repeats, 1 FROM (
        SELECT amount_centavos::text AS centavos, repeats, last_period_start
        FROM budget WHERE owner_id=${owner} AND period_kind=${kind}
          AND repeats AND first_period_start <= ${start}::date
        ORDER BY first_period_start DESC LIMIT 1
      ) latest
      WHERE last_period_start IS NULL OR last_period_start >= ${start}::date)
    ) candidates ORDER BY precedence LIMIT 1`;
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
const kindList = periodKinds.map((name) => `'${name}'`).join(",");
const kindRank = (kind: string) => `array_position(ARRAY[${kindList}], ${kind})`;
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
  // Past pages backward without walking the whole history. For each kind, the
  // newest period a page may show is its `top`: one that ended before today and
  // comes after the cursor. Only the budgets covering it, found by the same
  // lookups a single period uses, and the budgets ending latest before it, read
  // backward along budget_history, can hold that kind's newest periods, and
  // each contributes at most a page of them. Twice a page of budgets is read,
  // since a one-off and a repeating budget can cover the same period, which is
  // listed once. A page therefore reads the same bounded number of budgets and
  // periods however many years of budgets there are, and wherever the cursor
  // is. One more than a page is read to tell whether another page follows.
  const window = pastPageSize + 1;
  const { rows: past } = await database().query<PeriodFigures>(
    `${periodFiguresQuery(
      `SELECT g.kind, g.start, ${periodEnd("g.kind", "g.start")} AS "end" FROM (
        SELECT DISTINCT k.kind, s.start::date AS start
        FROM unnest(ARRAY[${kindList}]) AS k(kind)
        CROSS JOIN LATERAL (
          SELECT date_trunc(k.kind, (LEAST($2::date - 1,
              CASE WHEN $3::date IS NULL THEN $2::date - 1
                WHEN ${kindRank("k.kind")} > ${kindRank("$4::text")} THEN $3::date
                ELSE $3::date - 1 END) + 1)::timestamp
            - ('1 ' || k.kind)::interval)::date AS top
        ) t
        CROSS JOIN LATERAL (
          SELECT rows.first, rows.top FROM (
            (SELECT b.first_period_start AS first, t.top FROM budget b
            WHERE b.owner_id=$1 AND b.period_kind=k.kind AND NOT b.repeats
              AND b.first_period_start = t.top)
            UNION ALL
            (SELECT latest.first, t.top FROM (
              SELECT b.first_period_start AS first, b.last_period_start AS last
              FROM budget b
              WHERE b.owner_id=$1 AND b.period_kind=k.kind AND b.repeats
                AND b.first_period_start <= t.top
              ORDER BY b.first_period_start DESC LIMIT 1
            ) latest WHERE latest.last IS NULL OR latest.last >= t.top)
            UNION ALL
            (SELECT b.first_period_start, b.last_period_start FROM budget b
            WHERE b.owner_id=$1 AND b.period_kind=k.kind
              AND b.last_period_start < t.top
            ORDER BY b.last_period_start DESC LIMIT ${2 * window})
          ) rows ORDER BY rows.top DESC LIMIT ${2 * window}
        ) r
        CROSS JOIN LATERAL generate_series(r.top::timestamp,
          GREATEST(r.first::timestamp,
            r.top::timestamp - ${window - 1} * ('1 ' || k.kind)::interval),
          -('1 ' || k.kind)::interval) AS s(start)
      ) g
      ORDER BY "end" DESC, ${kindRank("g.kind")} LIMIT ${window}`,
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
// What a budget change did: refused because its period has ended, or applied,
// with the budget that then applies to the named period.
export type BudgetChange =
  | { ended: true }
  | { ended: false; budget: BudgetView | null };
// Every budget change runs in one transaction, and changes to one owner's
// budgets of one kind are serialized, so spans are read and rewritten without
// another change interleaving. Whether the period has ended is judged once the
// lock is held, just before the change: a request that waited for another
// change, even past midnight, sees the period as it stands when it runs.
// `apply` receives the owner, kind and period start as the statement
// parameters $1–$3. The budget replied is read after the change commits, so it
// describes what was kept.
async function changeBudgets(
  owner: string,
  request: SummaryRequest,
  apply: (client: PoolClient, params: string[], start: string) => Promise<void>,
): Promise<BudgetChange> {
  const period = summaryPeriod(request.kind, request.date);
  const client = await database().connect();
  let ended: boolean;
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`budget:${owner}:${request.kind}`],
    );
    ended = periodHasEnded(period, mexicoToday());
    if (!ended)
      await apply(client, [owner, request.kind, period.start], period.start);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return ended
    ? { ended: true }
    : { ended: false, budget: await budgetView(owner, request) };
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
