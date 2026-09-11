import { Pool, type PoolClient } from "pg";
import { readFile, readdir } from "node:fs/promises";
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "Migration failed: set DATABASE_URL in .env.local or the process environment.",
    );
    process.exitCode = 1;
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(70219001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query("SELECT 1 FROM app_migrations WHERE name = $1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await client.query(await readFile(`migrations/${name}`, "utf8"));
      await client.query("INSERT INTO app_migrations (name) VALUES ($1)", [
        name,
      ]);
      console.log(`Applied ${name}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}
main().catch((error: unknown) => {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{2,40}$/.test(error.code)
      ? error.code
      : null;
  const hint =
    code === "28P01"
      ? "Database authentication failed. Check DATABASE_URL credentials."
      : code === "ENOTFOUND" || code === "ECONNREFUSED"
        ? "Database host is unreachable. Check DATABASE_URL and network access."
        : code === "42501"
          ? "The database role lacks permission to apply migrations."
          : "Check database access and migration readiness.";
  // Never print raw database errors: they can include connection credentials or data.
  console.error(`Migration failed${code ? ` (${code})` : ""}. ${hint}`);
  process.exitCode = 1;
});
