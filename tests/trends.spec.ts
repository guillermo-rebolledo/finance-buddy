import { test, expect, type Page } from "@playwright/test";
import { choose, entryRow, expectRefusal, moveClockTo, resetClock, signIn } from "./helpers";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async () => {
  await pool.query("TRUNCATE financial_movement, category, category_seed");
});
test.afterAll(async () => {
  await pool.end();
  await resetClock();
});
// Mexico City midday on Friday 11 September 2026. The twelve months ending with
// September 2026 run from October 2025; the twelve before them end in September
// 2025, so a movement can be placed inside the span, inside the comparison, or
// outside both.
async function atMidday(page: Page) {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo("2026-09-11T18:00:00Z");
}
async function post(page: Page, fields: Record<string, unknown> = {}) {
  const response = await page.request.post("/api/journal", {
    headers: { Origin: origin },
    data: {
      id: randomUUID(),
      kind: "expense",
      amount: "1.00",
      date: "2026-09-05",
      categoryId: null,
      note: "",
      ...fields,
    },
  });
  expect(response.status()).toBe(200);
}
async function trends(page: Page, query = "") {
  const response = await page.request.get(`/api/journal/trends${query}`);
  expect(response.status()).toBe(200);
  return response.json();
}
function named(
  summary: { categories: { id: string; name: string }[] },
  name: string,
) {
  return summary.categories.find((entry) => entry.name === name)!.id;
}
// The history every case below reads: one month with a refund against it, one
// month of income, one older month inside the span, one inside the comparison
// span only, and one far enough back to belong to neither.
async function history(page: Page) {
  await atMidday(page);
  const summary = await (await page.request.get("/api/journal")).json();
  const groceries = named(summary, "Groceries");
  await post(page, { date: "2026-09-05", amount: "300", categoryId: groceries });
  await post(page, {
    date: "2026-09-06",
    amount: "100",
    kind: "refund",
    categoryId: groceries,
  });
  await post(page, {
    date: "2026-08-10",
    amount: "5000",
    kind: "income",
    categoryId: named(summary, "Salary"),
  });
  await post(page, { date: "2025-12-25", amount: "40" });
  await post(page, { date: "2025-03-03", amount: "70", categoryId: groceries });
  await post(page, { date: "2024-06-01", amount: "999" });
  return groceries;
}

test("a trend buckets movements into the same periods a summary resolves", async ({
  page,
}) => {
  const groceries = await history(page);
  const months = await trends(page, "?kind=month&date=2026-09-11");
  expect([months.kind, months.start, months.end]).toEqual([
    "month",
    "2025-10-01",
    "2026-09-30",
  ]);
  expect(months.previous).toEqual({ start: "2024-10-01", end: "2025-09-30" });
  expect(months.points).toHaveLength(12);
  expect(months.length).toBe(12);
  // A refund reduces expenses in the month it was received, exactly as it does
  // in that month's summary.
  expect(months.points.at(-1)).toEqual({
    start: "2026-09-01",
    end: "2026-09-30",
    label: "September 2026",
    tick: "Sep",
    income: "0.00",
    expenses: "200.00",
    netChange: "-200.00",
  });
  expect(
    months.points.find((point: { start: string }) => point.start === "2026-08-01"),
  ).toMatchObject({ income: "5000.00", expenses: "0.00", netChange: "5000.00" });
  expect(
    months.points.find((point: { start: string }) => point.start === "2025-12-01"),
  ).toMatchObject({ expenses: "40.00" });
  // Span totals reconcile with the periods behind them, and the movement older
  // than both spans is in neither figure.
  expect([months.income, months.expenses, months.netChange]).toEqual([
    "5000.00",
    "240.00",
    "4760.00",
  ]);
  expect([months.previousIncome, months.previousExpenses]).toEqual([
    "0.00",
    "70.00",
  ]);
  expect(
    months.points
      .reduce(
        (total: number, point: { expenses: string }) =>
          total + Number(point.expenses),
        0,
      )
      .toFixed(2),
  ).toBe(months.expenses);
  // Only spending is grouped, each group beside itself in the span before.
  expect(months.categories).toEqual([
    {
      categoryId: groceries,
      category: "Groceries",
      amount: "200.00",
      previous: "70.00",
    },
    {
      categoryId: null,
      category: "Uncategorized",
      amount: "40.00",
      previous: "0.00",
    },
  ]);
  // Each kind of period spans its own count and ends with the selected period.
  const weeks = await trends(page, "?kind=week&date=2026-09-11");
  expect([weeks.length, weeks.start, weeks.end]).toEqual([
    12,
    "2026-06-22",
    "2026-09-13",
  ]);
  expect(weeks.previous).toEqual({ start: "2026-03-30", end: "2026-06-21" });
  const days = await trends(page, "?kind=day&date=2026-09-11");
  expect([days.length, days.start, days.end]).toEqual([
    14,
    "2026-08-29",
    "2026-09-11",
  ]);
  expect(days.points.at(-1)).toMatchObject({
    start: "2026-09-11",
    tick: "11",
    expenses: "0.00",
  });
  // The landing selection is the same current week the summary lands on.
  const landing = await trends(page);
  expect([landing.kind, landing.end]).toEqual(["week", "2026-09-13"]);
});

test("spending groups past the readable limit fold into one that still reconciles", async ({
  page,
}) => {
  await atMidday(page);
  const summary = await (await page.request.get("/api/journal")).json();
  // Eight starter expense categories, each with its own amount, plus one
  // uncategorized expense: more groups than a chart can carry as bars.
  const expenses = summary.categories.filter(
    (category: { kind: string }) => category.kind === "expense",
  );
  expect(expenses).toHaveLength(8);
  for (const [index, category] of expenses.entries())
    await post(page, {
      date: "2026-09-05",
      amount: String((index + 1) * 10),
      categoryId: category.id,
    });
  await post(page, { date: "2026-09-05", amount: "5" });
  const trend = await trends(page, "?kind=month&date=2026-09-11");
  expect(trend.expenses).toBe("365.00");
  // Six groups are named; everything below them becomes one group that keeps
  // the figures rather than dropping them.
  expect(trend.categories).toHaveLength(7);
  expect(trend.categories.at(-1)).toMatchObject({
    category: "Other categories",
    amount: "35.00",
    previous: "0.00",
  });
  expect(
    trend.categories
      .reduce(
        (total: number, group: { amount: string }) => total + Number(group.amount),
        0,
      )
      .toFixed(2),
  ).toBe(trend.expenses);
});

test("the dashboard charts the selected period's trend and the registry keeps only its entries", async ({
  page,
}, testInfo) => {
  await history(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await choose(page, "Period", "Month");
  await expect(page.getByRole("heading", { name: "This month" })).toBeVisible();
  // The period's own figures sit above the span that ends with it.
  const totals = page.getByRole("region", { name: "Period totals" });
  await expect(totals.getByText("MXN 200.00", { exact: true })).toBeVisible();
  const charts = page.getByRole("region", { name: "Trends" });
  await expect(
    charts.getByRole("heading", { name: "The last 12 months" }),
  ).toBeVisible();
  await expect(charts).toContainText("2025-10-01 – 2026-09-30");
  // Every mark names its own period and its own figures, so a value is never
  // reachable only by pointing at it.
  await expect(
    charts.getByRole("img", {
      name: "September 2026. Income MXN 0.00. Expenses MXN 200.00.",
    }),
  ).toBeVisible();
  await expect(
    charts.getByRole("img", {
      name: "August 2026. Income MXN 5,000.00. Expenses MXN 0.00.",
    }),
  ).toBeVisible();
  await expect(
    charts.getByRole("img", {
      name: "September 2026. Net change -MXN 200.00.",
    }),
  ).toBeVisible();
  await expect(charts).toContainText("Groceries");
  await expect(charts).toContainText("MXN 70.00 in the 12 months before.");
  // Kept as a test artifact so the charts can be looked at.
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
  });
  // The charts follow the selection: a period with nothing behind it says so.
  await page.getByLabel("Jump to date").fill("2022-05-04");
  await expect(
    page.getByRole("heading", { name: "May 2022", level: 1 }),
  ).toBeVisible();
  await expect(
    charts.getByText("Nothing recorded in these 12 months"),
  ).toBeVisible();
  // Neither viewport is pushed sideways by a chart wider than its card.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  // The registry keeps the movements and nothing that summarizes them.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  // The purchase and its refund belong to the week before the current one.
  await page.getByLabel("Jump to date").fill("2026-09-05");
  await expect(
    page.getByRole("heading", { name: "Aug 31, 2026 – Sep 6, 2026", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Period totals" }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Trends" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export PDF" }),
  ).toHaveCount(0);
  await expect(
    entryRow(page, "Expense", "Groceries"),
  ).toBeVisible();
  await expect(
    entryRow(page, "Refund", "Groceries"),
  ).toBeVisible();
});

test("the dashboard and its trends refuse unauthorized and unresolvable requests", async ({
  page,
  request,
}) => {
  await expectRefusal(
    await request.get("/api/journal/trends"),
    "unauthenticated",
    401,
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await atMidday(page);
  for (const query of ["?kind=quarter", "?kind=month&date=2026-02-30", "?date="])
    await expectRefusal(
      await page.request.get(`/api/journal/trends${query}`),
      "invalid_period",
      400,
    );
  expect(
    (await page.request.get("/api/journal/trends?kind=day&date=2026-09-11")).status(),
  ).toBe(200);
});
