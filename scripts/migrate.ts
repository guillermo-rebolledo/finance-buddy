import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for explicit migrations");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
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
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check database access and migration readiness.",
  );
  process.exitCode = 1;
});
