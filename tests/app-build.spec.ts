import { test, expect } from "@playwright/test";
import { expectRefusal, moveClockTo, resetClock, signIn } from "./helpers";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
// The test server serves app build 12 and later.
const header = "X-Finance-Buddy-Build";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async ({}, testInfo) => {
  // The gate reads a request header, not the viewport, so it is exercised once.
  test.skip(testInfo.project.name !== "desktop");
  await pool.query("TRUNCATE financial_movement, category, category_seed");
});
test.afterAll(async () => {
  await pool.end();
  await resetClock();
});

const reads = [
  "/api/private",
  "/api/journal",
  "/api/journal/trends?kind=week&date=2026-09-11",
  "/api/categories",
  "/api/journal/export?kind=week&date=2026-09-11",
];
const entry = {
  kind: "expense",
  amount: "12.00",
  date: "2026-09-10",
  categoryId: null,
  note: "",
};

test("an app build older than the server supports is asked to update before anything is read or written", async ({
  page,
  request,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo("2026-09-11T18:00:00Z");
  for (const build of ["11", "11.9.9", "1", "twelve", "12.a", "-12"]) {
    for (const path of reads)
      await expectRefusal(
        await page.request.get(path, { headers: { [header]: build } }),
        "upgrade_required",
        426,
      );
    await expectRefusal(
      await page.request.post("/api/journal", {
        headers: { Origin: origin, [header]: build },
        data: { id: randomUUID(), ...entry },
      }),
      "upgrade_required",
      426,
    );
    await expectRefusal(
      await page.request.post("/api/categories", {
        headers: { Origin: origin, [header]: build },
        data: { action: "create", kind: "expense", name: `Build ${build}` },
      }),
      "upgrade_required",
      426,
    );
  }
  // The build is judged before the session, so even a signed-out old build is
  // told to update rather than to sign in.
  await expectRefusal(
    await request.get("/api/journal", { headers: { [header]: "11" } }),
    "upgrade_required",
    426,
  );
  // Nothing was written by any refused request.
  const report = await (await page.request.get("/api/journal")).json();
  expect(report.entries).toEqual([]);
  expect(JSON.stringify(await (await page.request.get("/api/categories")).json())).not.toContain(
    "Build",
  );
});

test("a supported app build, and a request naming no build, are served normally", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo("2026-09-11T18:00:00Z");
  for (const build of ["12", "12.0", "12.0.1", "13", "100"])
    for (const path of reads)
      expect(
        (await page.request.get(path, { headers: { [header]: build } })).status(),
      ).toBe(200);
  expect(
    (
      await page.request.post("/api/journal", {
        headers: { Origin: origin, [header]: "12.1" },
        data: { id: randomUUID(), ...entry },
      })
    ).status(),
  ).toBe(200);
  for (const path of reads)
    expect((await page.request.get(path)).status()).toBe(200);
  expect((await (await page.request.get("/api/journal")).json()).entries).toHaveLength(1);
});
