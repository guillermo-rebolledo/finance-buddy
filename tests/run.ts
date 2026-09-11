import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";

async function main() {
  // Never read DATABASE_URL: every run owns a new, disposable container.
  const name = `finance-buddy-test-${randomUUID()}`;
  const password = randomUUID();
  function docker(...args: string[]) {
    const result = spawnSync("docker", args, { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "Docker failed");
    return result.stdout.trim();
  }
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-e",
    "POSTGRES_DB=finance_buddy_test",
    "-p",
    "127.0.0.1::5432",
    "postgres:17.9-alpine",
  );
  const fixtureDir = await mkdtemp(join(tmpdir(), "finance-buddy-test-"));
  try {
    const port = docker("port", name, "5432/tcp").split(":").at(-1);
    const databaseURL = `postgres://postgres:${password}@127.0.0.1:${port}/finance_buddy_test`;
    const pool = new Pool({ connectionString: databaseURL });
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await pool.query("select 1");
          break;
        } catch {
          if (attempt > 60) throw new Error("Test database did not start");
          await setTimeout(500);
        }
      }
    } finally {
      await pool.end();
    }
    const env = {
      ...process.env,
      TEST_CLOCK_FILE: join(fixtureDir, "clock"),
      DATABASE_URL: databaseURL,
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      PRIVATE_OWNER_EMAIL: "owner@example.test",
    };
    const migrate = spawnSync("pnpm", ["db:migrate"], {
      env,
      stdio: "inherit",
    });
    if (migrate.status !== 0) throw new Error("Migration failed");
    // Verify that the same checked-in migrations are safe to run again.
    if (
      spawnSync("pnpm", ["db:migrate"], { env, stdio: "inherit" }).status !== 0
    )
      throw new Error("Migration repeat failed");
    const child = spawn(
      "pnpm",
      ["exec", "playwright", "test", ...process.argv.slice(2)],
      { env, stdio: "inherit" },
    );
    process.exitCode = await new Promise<number>((resolve) =>
      child.on("exit", (code) => resolve(code ?? 1)),
    );
  } finally {
    docker("rm", "--force", name);
    await rm(fixtureDir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
