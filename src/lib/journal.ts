import "server-only";
import { randomUUID } from "node:crypto";
import { budgetOf, periodBudgetQuery } from "./budgets";
import { database } from "./database";
import {
  categoryRefusal,
  centavos,
  decimal,
  entryKindDetails,
  entryMissing,
  mexicoToday,
  summaryPeriod,
  totalsOf,
  type EntryKind,
  type Category,
  type EntryError,
  type EntryInput,
  type Summary,
  type SummaryRequest,
} from "./financial";
// Starter categories are inserted exactly once per owner, recorded by the seed
// row, so renamed or archived starters are never reseeded or duplicated.
export async function seedCategories(owner: string) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const seeded = await client.query(
      "INSERT INTO category_seed(owner_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING owner_id",
      [owner],
    );
    if (seeded.rowCount) {
      for (const [kind, names] of Object.entries({
        income: ["Salary", "Freelance", "Other income"],
        expense: [
          "Groceries",
          "Dining",
          "Transport",
          "Housing",
          "Utilities",
          "Health",
          "Shopping",
          "Entertainment",
        ],
      })) {
        for (const name of names)
          await client.query(
            "INSERT INTO category(id, owner_id, kind, name) VALUES ($1,$2,$3,$4)",
            [randomUUID(), owner, kind, name],
          );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
// One summary shape serves every kind of period: the request resolves to start
// and end dates, and the same arithmetic then fills totals, breakdown and rows.
export async function summarize(
  owner: string,
  request: SummaryRequest,
): Promise<Summary> {
  await seedCategories(owner);
  const today = mexicoToday();
  const period = summaryPeriod(request.kind, request.date);
  // One statement supplies entries, choices and the period's budget from the
  // same PostgreSQL snapshot, so the budget measures exactly these totals.
  const {
    rows: [data],
  } = await database().query(
    `SELECT
    COALESCE((SELECT json_agg(c ORDER BY c.kind, c.name, c.id) FROM (SELECT id, kind, name FROM category WHERE owner_id=$1 AND active) c), '[]') AS categories,
    COALESCE((SELECT json_agg(e ORDER BY e.date DESC, e.created_at DESC, e.id DESC) FROM (
      SELECT m.id, m.kind, m.amount_centavos::text AS centavos, m.currency, to_char(m.movement_date,'YYYY-MM-DD') AS date,
      m.category_id AS "categoryId", COALESCE(c.name,'Uncategorized') AS category, m.note, m.created_at
      FROM financial_movement m LEFT JOIN category c ON c.id=m.category_id AND c.owner_id=m.owner_id
      WHERE m.owner_id=$1 AND m.movement_date BETWEEN $2::date AND $3::date
    ) e), '[]') AS entries,
    (SELECT row_to_json(b) FROM (${periodBudgetQuery("$1", "$4", "$2")}) b) AS budget`,
    [owner, period.start, period.end, request.kind],
  );
  const { income, expenses } = totalsOf(data.entries);
  const groups = new Map<
    string | null,
    { categoryId: string | null; category: string; value: bigint }
  >();
  const entries = data.entries.map(
    (
      row: EntryInput & { centavos: string; category: string; currency: "MXN" },
    ) => {
      const value = BigInt(row.centavos);
      // A refund reduces expenses and its category group on its own movement date.
      const kind = entryKindDetails[row.kind as EntryKind];
      const effect = value * kind.sign;
      if (kind.total === "expenses") {
        const group = groups.get(row.categoryId) ?? {
          categoryId: row.categoryId,
          category: row.category,
          value: 0n,
        };
        group.value += effect;
        groups.set(row.categoryId, group);
      }
      return {
        id: row.id,
        kind: row.kind,
        amount: decimal(value),
        currency: row.currency,
        date: row.date,
        categoryId: row.categoryId,
        category: row.category,
        note: row.note,
      };
    },
  );
  return {
    today,
    ...request,
    ...period,
    currency: "MXN",
    categories: data.categories as Category[],
    entries,
    income: decimal(income),
    expenses: decimal(expenses),
    netChange: decimal(income - expenses),
    breakdown: [...groups.values()].map(({ value, ...group }) => ({
      ...group,
      amount: decimal(value),
    })),
    budget: budgetOf(data.budget, request.kind, period, expenses, today),
  };
}
export async function saveEntry(
  owner: string,
  entry: EntryInput,
): Promise<EntryError | undefined> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    // Serializes retries of the same request, including concurrent submissions.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [owner + entry.id],
    );
    const existing = await client.query(
      `SELECT kind=$3 AND amount_centavos=$4 AND movement_date=$5::date
      AND category_id IS NOT DISTINCT FROM $6::uuid AND note=$7 AS matches
      FROM financial_movement WHERE owner_id=$1 AND id=$2`,
      [
        owner,
        entry.id,
        entry.kind,
        centavos(entry.amount).toString(),
        entry.date,
        entry.categoryId,
        entry.note,
      ],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return existing.rows[0].matches
        ? undefined
        : {
            field: "id",
            message:
              "This entry identifier was already saved with different values. Refresh to review it.",
          };
    }
    if (entry.categoryId) {
      const category = await client.query(
        "SELECT 1 FROM category WHERE owner_id=$1 AND id=$2 AND kind=$3 AND active FOR SHARE",
        [
          owner,
          entry.categoryId,
          entryKindDetails[entry.kind as EntryKind].categoryKind,
        ],
      );
      if (!category.rowCount) {
        await client.query("ROLLBACK");
        return categoryRefusal(entry.kind);
      }
    }
    await client.query(
      "INSERT INTO financial_movement(id, owner_id, kind, amount_centavos, movement_date, category_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        entry.id,
        owner,
        entry.kind,
        centavos(entry.amount).toString(),
        entry.date,
        entry.categoryId,
        entry.note,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
// A correction replaces the whole entry in one owner-scoped statement, so a
// failed category check leaves nothing changed and a repeated correction simply
// writes the same values again. The entry keeps the archived category it already
// carries while another field changes; any replacement must be active, and both
// must belong to the movement type's own category list.
export async function editEntry(
  owner: string,
  entry: EntryInput,
): Promise<EntryError | undefined> {
  const edited = await database().query(
    `UPDATE financial_movement m SET kind=$3, amount_centavos=$4,
      movement_date=$5::date, category_id=$6::uuid, note=$7
    WHERE m.owner_id=$1 AND m.id=$2 AND ($6::uuid IS NULL OR EXISTS (
      SELECT 1 FROM category c WHERE c.owner_id=$1 AND c.id=$6::uuid
      AND c.kind=$8 AND (c.active OR c.id=m.category_id)))`,
    [
      owner,
      entry.id,
      entry.kind,
      centavos(entry.amount).toString(),
      entry.date,
      entry.categoryId,
      entry.note,
      entryKindDetails[entry.kind as EntryKind].categoryKind,
    ],
  );
  if (edited.rowCount) return;
  // Nothing changed: either the entry is not the owner's, or its category was
  // refused. Only the owner's own rows are ever distinguished.
  const existing = await database().query(
    "SELECT 1 FROM financial_movement WHERE owner_id=$1 AND id=$2",
    [owner, entry.id],
  );
  return existing.rowCount
    ? categoryRefusal(entry.kind)
    : { field: "id", message: entryMissing };
}
// Deletion is permanent and leaves no trace to restore: the row is removed and
// every total recomputes from what remains. Another owner's identifier, and one
// already deleted, match nothing and change nothing.
export async function deleteEntry(
  owner: string,
  id: string,
): Promise<EntryError | undefined> {
  const deleted = await database().query(
    "DELETE FROM financial_movement WHERE owner_id=$1 AND id=$2",
    [owner, id],
  );
  if (!deleted.rowCount) return { field: "id", message: entryMissing };
}
