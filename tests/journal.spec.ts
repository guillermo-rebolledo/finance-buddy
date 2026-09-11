import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";
import { Pool } from "pg";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async () => {
  await pool.query("TRUNCATE financial_movement, category, category_seed");
});
test.afterAll(async () => {
  await pool.end();
  await writeFile(process.env.TEST_CLOCK_FILE!, "0");
});
async function overview(page: import("@playwright/test").Page) {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await writeFile(
    process.env.TEST_CLOCK_FILE!,
    String(Date.parse("2026-09-07T05:30:00Z") - Date.now()),
  );
  await page.reload();
  return (await page.request.get("/api/journal")).json();
}
async function post(
  page: import("@playwright/test").Page,
  fields: Record<string, unknown> = {},
) {
  return page.request.post("/api/journal", {
    headers: { Origin: origin },
    data: {
      id: randomUUID(),
      kind: "expense",
      amount: "1.00",
      date: "2026-09-06",
      categoryId: null,
      note: "",
      ...fields,
    },
  });
}

test("income and expenses persist in a coherent exact weekly report", async ({
  page,
  context,
}) => {
  await overview(page);
  const initial = await (await context.request.get("/api/journal")).json();
  for (const [kind, amount] of [
    ["income", "10000"],
    ["expense", "1000"],
    ["expense", "500"],
  ]) {
    const response = await context.request.post("/api/journal", {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        id: randomUUID(),
        kind,
        amount,
        date: initial.today,
        categoryId: null,
        note: "",
      },
    });
    expect(response.status()).toBe(200);
  }
  const report = await (await context.request.get("/api/journal")).json();
  expect(report.income).toBe("10000.00");
  expect(report.expenses).toBe("1500.00");
  expect(report.netChange).toBe("8500.00");
  expect(report.breakdown).toEqual([
    { categoryId: null, category: "Uncategorized", amount: "1500.00" },
  ]);
  await page.reload();
  await expect(page.getByText("MXN 8,500.00", { exact: true })).toBeVisible();
});

test("phone and desktop save optional fields, preserve invalid input, and recover a lost response once", async ({
  page,
  browser,
}, testInfo) => {
  await overview(page);
  await expect(
    page.getByText("No entries this week", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await expect(page.getByLabel("Movement date", { exact: true })).toHaveValue(
    "2026-09-06",
  );
  await page.getByLabel("Type", { exact: true }).selectOption("expense");
  await page.getByLabel("Amount (MXN)").fill("0.001");
  await page
    .getByLabel("Note (optional)")
    .fill("Coffee <script>literal</script>");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Entry needs attention" }),
  ).toContainText("two decimal places");
  await expect(page.getByLabel("Note (optional)")).toHaveValue(
    "Coffee <script>literal</script>",
  );
  await page.getByLabel("Amount (MXN)").fill("0.10");
  await page.route(
    "**/api/journal",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch(); // The database commits; only the response is lost.
      await route.abort();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry same entry" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Amount (MXN)")).toBeDisabled();
  await page.getByRole("button", { name: "Retry same entry" }).click();
  await expect(page.getByRole("status")).toHaveText("Entry saved.");
  expect(
    (await (await page.request.get("/api/journal")).json()).entries,
  ).toHaveLength(1);
  await post(page, { amount: "0.20" });
  await page.reload();
  const report = await (await page.request.get("/api/journal")).json();
  expect(report.expenses).toBe("0.30");
  expect(report.netChange).toBe("-0.30");
  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await overview(secondPage);
  expect(await (await secondPage.request.get("/api/journal")).json()).toEqual(
    report,
  );
  await second.close();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("weekly-overview.png"),
    fullPage: true,
  });
});

test("server rejects invalid amounts, dates, types and categories without changing the journal", async ({
  page,
  request,
}) => {
  const initial = await overview(page);
  for (const amount of [
    "0",
    "-1",
    "0.001",
    "NaN",
    "1e3",
    "",
    "1000000000000",
    1,
    null,
  ])
    expect((await post(page, { amount })).status()).toBe(400);
  for (const date of [
    "2026-09-07",
    "2026-02-30",
    "2025-02-29",
    "0000-01-01",
    "bad",
    null,
  ])
    expect((await post(page, { date })).status()).toBe(400);
  for (const kind of ["refund", "transfer", "", null])
    expect((await post(page, { kind })).status()).toBe(400);
  expect((await post(page, { note: "x".repeat(2001) })).status()).toBe(400);
  const salary = initial.categories.find(
    (category: { name: string }) => category.name === "Salary",
  );
  expect((await post(page, { categoryId: salary.id })).status()).toBe(400);
  expect((await post(page, { categoryId: randomUUID() })).status()).toBe(400);
  expect((await request.get("/api/journal")).status()).toBe(401);
  expect((await request.post("/api/journal", { data: {} })).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/journal", {
        headers: { Origin: "https://foreign.test" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.post("/api/journal", { data: {} })).status()).toBe(
    403,
  );
  const response = await page.request.get("/api/journal");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual(initial);
});

test("starter categories seed once and foreign or archived assignments cannot leak or change records", async ({
  page,
}) => {
  const initial = await overview(page);
  expect(
    initial.categories
      .filter((c: { kind: string }) => c.kind === "income")
      .map((c: { name: string }) => c.name)
      .sort(),
  ).toEqual(["Freelance", "Other income", "Salary"]);
  expect(
    initial.categories
      .filter((c: { kind: string }) => c.kind === "expense")
      .map((c: { name: string }) => c.name)
      .sort(),
  ).toEqual([
    "Dining",
    "Entertainment",
    "Groceries",
    "Health",
    "Housing",
    "Shopping",
    "Transport",
    "Utilities",
  ]);
  const groceries = initial.categories.find(
    (c: { name: string }) => c.name === "Groceries",
  );
  const id = randomUUID();
  expect((await post(page, { id, categoryId: groceries.id })).status()).toBe(
    200,
  );
  // Fixture-only setup for lifecycle and a second principal; assertions stay at HTTP boundaries.
  await pool.query(
    "UPDATE category SET name='Food', active=false WHERE id=$1",
    [groceries.id],
  );
  const foreignOwner = randomUUID(),
    foreignCategory = randomUUID(),
    foreignEntry = randomUUID();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,$2,$3,true,now(),now())',
    [foreignOwner, "Foreign", `${foreignOwner}@example.test`],
  );
  await pool.query(
    "INSERT INTO category(id,owner_id,kind,name) VALUES ($1,$2,'expense','Private category')",
    [foreignCategory, foreignOwner],
  );
  await pool.query(
    "INSERT INTO financial_movement(id,owner_id,kind,amount_centavos,movement_date,note) VALUES ($1,$2,'expense',99900,'2026-09-06','Private note')",
    [foreignEntry, foreignOwner],
  );
  expect(
    (
      await post(page, { categoryId: foreignCategory, ownerId: foreignOwner })
    ).status(),
  ).toBe(400);
  expect((await post(page, { categoryId: groceries.id })).status()).toBe(400);
  const report = await (
    await page.request.get(
      `/api/journal?ownerId=${foreignOwner}&id=${foreignEntry}`,
    )
  ).json();
  expect(report.categories).toHaveLength(10);
  expect(report.entries).toHaveLength(1);
  expect(report.entries[0].category).toBe("Food");
  expect(JSON.stringify(report)).not.toContain("Private");
  expect(report.expenses).toBe("1.00");
  await page.reload();
  expect(
    (await (await page.request.get("/api/journal")).json()).categories,
  ).toHaveLength(10);
  const responses = await Promise.all([
    post(page, { id: foreignEntry, ownerId: foreignOwner }),
    post(page, { id: foreignEntry, ownerId: foreignOwner }),
  ]);
  expect(responses.map((r) => r.status())).toEqual([200, 200]);
  expect(
    (await (await page.request.get("/api/journal")).json()).entries,
  ).toHaveLength(2);
});

test("movement dates define Monday–Sunday membership and backdated success is accurate", async ({
  page,
}) => {
  const initial = await overview(page);
  expect([initial.today, initial.start, initial.end]).toEqual([
    "2026-09-06",
    "2026-08-31",
    "2026-09-06",
  ]);
  await post(page, { date: "2026-08-31", amount: "2" });
  await post(page, { date: "2026-09-06", amount: "3" });
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.getByLabel("Type", { exact: true }).selectOption("expense");
  await page.getByLabel("Amount (MXN)").fill("100");
  await page.getByLabel("Movement date", { exact: true }).fill("2026-08-30");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("outside this week");
  const report = await (await page.request.get("/api/journal")).json();
  expect(report.expenses).toBe("5.00");
  expect(report.entries.map((e: { date: string }) => e.date)).toEqual([
    "2026-09-06",
    "2026-08-31",
  ]);
  await writeFile(
    process.env.TEST_CLOCK_FILE!,
    String(Date.parse("2026-08-30T18:00:00Z") - Date.now()),
  );
  const earlier = await (await page.request.get("/api/journal")).json();
  expect(earlier.expenses).toBe("100.00");
  expect(earlier.entries).toHaveLength(1);
});

test("failed report loads show an error and retry instead of an empty period", async ({
  page,
}) => {
  await overview(page);
  await pool.query(
    "ALTER TABLE financial_movement RENAME TO unavailable_financial_movement",
  );
  try {
    await page.reload();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Weekly overview unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByText("No entries this week", { exact: true }),
    ).toHaveCount(0);
    expect((await page.request.get("/api/journal")).status()).toBe(503);
  } finally {
    await pool.query(
      "ALTER TABLE unavailable_financial_movement RENAME TO financial_movement",
    );
  }
  await page.getByRole("button", { name: "Retry overview" }).click();
  await expect(
    page.getByText("No entries this week", { exact: true }),
  ).toBeVisible();
});

test("all period rows reconcile exactly across calendar boundaries", async ({
  page,
}) => {
  await overview(page);
  for (const [instant, today, start, end] of [
    ["2024-02-29T18:00:00Z", "2024-02-29", "2024-02-26", "2024-03-03"],
    ["2025-12-31T18:00:00Z", "2025-12-31", "2025-12-29", "2026-01-04"],
  ]) {
    await writeFile(
      process.env.TEST_CLOCK_FILE!,
      String(Date.parse(instant) - Date.now()),
    );
    expect((await post(page, { date: today, amount: "0.10" })).status()).toBe(
      200,
    );
    const report = await (await page.request.get("/api/journal")).json();
    expect([report.today, report.start, report.end, report.expenses]).toEqual([
      today,
      start,
      end,
      "0.10",
    ]);
  }
  await writeFile(
    process.env.TEST_CLOCK_FILE!,
    String(Date.parse("2026-09-07T06:30:00Z") - Date.now()),
  );
  const id = randomUUID();
  expect((await post(page, { id, date: "2026-09-07" })).status()).toBe(200);
  expect(
    (await post(page, { id, date: "2026-09-07", amount: "2" })).status(),
  ).toBe(400);
  for (let index = 0; index < 105; index++)
    expect(
      (await post(page, { date: "2026-09-07", amount: "0.10" })).status(),
    ).toBe(200);
  const report = await (await page.request.get("/api/journal")).json();
  expect([report.start, report.end, report.expenses, report.netChange]).toEqual(
    ["2026-09-07", "2026-09-13", "11.50", "-11.50"],
  );
  expect(report.entries).toHaveLength(106);
  expect(report.breakdown[0].amount).toBe("11.50");
  expect(
    (await (await page.request.get("/api/journal")).json()).entries,
  ).toEqual(report.entries);
});
