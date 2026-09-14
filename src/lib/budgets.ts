import "server-only";
import { database } from "./database";
import {
  budgetFigures,
  mexicoToday,
  periodKinds,
  periodStart,
  shiftPeriod,
  summaryPeriod,
  totalsOf,
  type BudgetList,
  type BudgetView,
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
// One statement reads the budget and the period's movements, so its total
// expenses are exactly what the summary of that snapshot reports.
export async function budgetView(owner: string, request: SummaryRequest) {
  const period = summaryPeriod(request.kind, request.date);
  const {
    rows: [data],
  } = await database().query(
    `SELECT
    (SELECT row_to_json(b) FROM (${periodBudgetQuery("$1", "$2", "$3")}) b) AS budget,
    COALESCE((SELECT json_agg(m) FROM (
      SELECT kind, amount_centavos::text AS centavos FROM financial_movement
      WHERE owner_id=$1 AND movement_date BETWEEN $3::date AND $4::date
    ) m), '[]') AS movements`,
    [owner, request.kind, period.start, period.end],
  );
  return budgetOf(
    data.budget,
    request.kind,
    period,
    totalsOf(data.movements).expenses,
    mexicoToday(),
  );
}
// Today's day, week and month, each with its budget. One statement reads the
// three budgets and every movement across the three periods, so each view's
// total expenses are exactly what that period's summary reports.
export async function listBudgets(owner: string): Promise<BudgetList> {
  const today = mexicoToday();
  const periods = periodKinds.map((kind) => ({
    kind,
    period: summaryPeriod(kind, today),
  }));
  const from = periods.map(({ period }) => period.start).sort()[0];
  const to = periods.map(({ period }) => period.end).sort().at(-1)!;
  const {
    rows: [data],
  } = await database().query(
    `SELECT
    ${periods
      .map(
        ({ kind }, index) =>
          `(SELECT row_to_json(b) FROM (${periodBudgetQuery("$1", `$${4 + index * 2}`, `$${5 + index * 2}`)}) b) AS "${kind}",`,
      )
      .join("\n")}
    COALESCE((SELECT json_agg(m) FROM (
      SELECT kind, amount_centavos::text AS centavos,
        to_char(movement_date,'YYYY-MM-DD') AS date
      FROM financial_movement
      WHERE owner_id=$1 AND movement_date BETWEEN $2::date AND $3::date
    ) m), '[]') AS movements`,
    [
      owner,
      from,
      to,
      ...periods.flatMap(({ kind, period }) => [kind, period.start]),
    ],
  );
  const movements: { kind: string; centavos: string; date: string }[] =
    data.movements;
  const now = Object.fromEntries(
    periods.map(({ kind, period }) => [
      kind,
      budgetOf(
        data[kind],
        kind,
        period,
        totalsOf(
          movements.filter(
            ({ date }) => date >= period.start && date <= period.end,
          ),
        ).expenses,
        today,
      ),
    ]),
  ) as BudgetList["now"];
  return {
    today,
    currency: "MXN",
    now,
    repeating: [],
    upcoming: [],
    past: [],
    nextBefore: null,
  };
}
// Sets the repeating amount from one period onward. A span starting there takes
// the new amount. A span that started earlier is closed at the period before,
// and the new amount continues to that span's own end. Otherwise the new span
// runs until the period before the next later span, or stays open. A one-off
// budget on that period gives way; one-off budgets elsewhere are untouched.
// Applying the same request again leaves the same budgets.
export async function setRepeatingBudget(
  owner: string,
  request: SummaryRequest,
  amount: bigint,
) {
  const { kind } = request;
  const start = periodStart(kind, request.date);
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    // Changes to one owner's budgets of one kind are serialized, so spans are
    // read and rewritten without another change interleaving.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`budget:${owner}:${kind}`],
    );
    const scope = [owner, kind, start];
    const {
      rows: [containing],
    } = await client.query(
      `SELECT to_char(first_period_start,'YYYY-MM-DD') AS first,
        to_char(last_period_start,'YYYY-MM-DD') AS last
      FROM budget WHERE owner_id=$1 AND period_kind=$2 AND repeats
      AND first_period_start <= $3::date
      AND (last_period_start IS NULL OR last_period_start >= $3::date)`,
      scope,
    );
    if (containing?.first === start)
      await client.query(
        `UPDATE budget SET amount_centavos=$4, updated_at=now()
        WHERE owner_id=$1 AND period_kind=$2 AND repeats
        AND first_period_start=$3::date AND amount_centavos<>$4`,
        [...scope, amount.toString()],
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
          scope,
        );
        until = next.first && shiftPeriod(kind, next.first, -1);
      }
      await client.query(
        `INSERT INTO budget(owner_id, period_kind, first_period_start,
          last_period_start, repeats, amount_centavos)
        VALUES ($1,$2,$3::date,$4::date,true,$5)`,
        [...scope, until, amount.toString()],
      );
    }
    await client.query(
      `DELETE FROM budget WHERE owner_id=$1 AND period_kind=$2 AND NOT repeats
      AND first_period_start=$3::date`,
      scope,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  // Read after the change commits, so the reply describes what was kept.
  return budgetView(owner, request);
}
