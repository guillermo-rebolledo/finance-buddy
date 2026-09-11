import "server-only";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getConfig } from "./config";
import {
  centavos,
  decimal,
  mexicoToday,
  weekContaining,
  type Category,
  type EntryError,
  type EntryInput,
  type WeeklyReport,
} from "./financial";
let pool: Pool;
function database() {
  const config = getConfig();
  if (!config) throw new Error("Workspace unavailable");
  return (pool ??= new Pool({
    connectionString: config.databaseURL,
    max: 5,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  }));
}
async function seedCategories(owner: string) {
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
export async function weeklyReport(owner: string): Promise<WeeklyReport> {
  await seedCategories(owner);
  const today = mexicoToday();
  const period = weekContaining(today);
  // One statement supplies both entries and choices from the same PostgreSQL snapshot.
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
    ) e), '[]') AS entries`,
    [owner, period.start, period.end],
  );
  let income = 0n,
    expenses = 0n;
  const groups = new Map<
    string | null,
    { categoryId: string | null; category: string; value: bigint }
  >();
  const entries = data.entries.map(
    (
      row: EntryInput & { centavos: string; category: string; currency: "MXN" },
    ) => {
      const value = BigInt(row.centavos);
      if (row.kind === "income") income += value;
      else {
        expenses += value;
        const group = groups.get(row.categoryId) ?? {
          categoryId: row.categoryId,
          category: row.category,
          value: 0n,
        };
        group.value += value;
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
        [owner, entry.categoryId, entry.kind],
      );
      if (!category.rowCount) {
        await client.query("ROLLBACK");
        return {
          field: "categoryId",
          message: "Choose an active category for this entry type.",
        };
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
