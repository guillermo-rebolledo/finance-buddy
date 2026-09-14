import { test, expect } from "@playwright/test";
import { choose, moveClockTo, resetClock, signIn } from "./helpers";
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
// Mexico City midday on Tuesday 1 September 2026, a week and a month still running.
async function atMidday(page: import("@playwright/test").Page) {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo("2026-09-01T18:00:00Z");
  await page.reload();
}
async function post(
  page: import("@playwright/test").Page,
  fields: Record<string, unknown> = {},
) {
  const response = await page.request.post("/api/journal", {
    headers: { Origin: origin },
    data: {
      id: randomUUID(),
      kind: "expense",
      amount: "1.00",
      date: "2026-09-01",
      categoryId: null,
      note: "",
      ...fields,
    },
  });
  expect(response.status()).toBe(200);
}
async function summary(
  page: import("@playwright/test").Page,
  kind?: string,
  date?: string,
) {
  const query = new URLSearchParams();
  if (kind) query.set("kind", kind);
  if (date) query.set("date", date);
  const response = await page.request.get(`/api/journal?${query}`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function history(page: import("@playwright/test").Page) {
  await atMidday(page);
  for (const [date, amount, kind] of [
    ["2024-02-26", "1", "expense"],
    ["2024-02-29", "5", "expense"],
    ["2024-03-03", "2", "expense"],
    ["2025-12-31", "100", "income"],
    ["2026-01-01", "7", "expense"],
    ["2026-08-20", "25", "expense"],
    ["2026-09-01", "3", "expense"],
  ])
    await post(page, { date, amount, kind });
}

test("days, weeks and months resolve the same Mexico City calendar boundaries", async ({
  page,
}) => {
  await history(page);
  // Entries recorded today still belong to the historical periods they happened in.
  const leapDay = await summary(page, "day", "2024-02-29");
  expect([
    leapDay.kind,
    leapDay.date,
    leapDay.start,
    leapDay.end,
    leapDay.today,
    leapDay.expenses,
  ]).toEqual([
    "day",
    "2024-02-29",
    "2024-02-29",
    "2024-02-29",
    "2026-09-01",
    "5.00",
  ]);
  expect(leapDay.entries).toHaveLength(1);
  // A week spanning two months keeps its Monday–Sunday interval.
  const leapWeek = await summary(page, "week", "2024-02-29");
  expect([leapWeek.start, leapWeek.end, leapWeek.expenses]).toEqual([
    "2024-02-26",
    "2024-03-03",
    "8.00",
  ]);
  expect(leapWeek.entries).toHaveLength(3);
  // Any anchor inside the week reports the same period; only the anchor differs.
  for (const anchor of ["2024-02-26", "2024-03-03"])
    expect(await summary(page, "week", anchor)).toEqual({
      ...leapWeek,
      date: anchor,
    });
  // February keeps its own length, in a leap year and outside one.
  const leapMonth = await summary(page, "month", "2024-02-15");
  expect([leapMonth.start, leapMonth.end, leapMonth.expenses]).toEqual([
    "2024-02-01",
    "2024-02-29",
    "6.00",
  ]);
  expect((await summary(page, "month", "2025-02-10")).end).toBe("2025-02-28");
  // A week crossing New Year reports both calendar years together.
  const newYear = await summary(page, "week", "2026-01-01");
  expect([
    newYear.start,
    newYear.end,
    newYear.income,
    newYear.expenses,
    newYear.netChange,
  ]).toEqual(["2025-12-29", "2026-01-04", "100.00", "7.00", "93.00"]);
  expect(await summary(page, "week", "2025-12-31")).toEqual({
    ...newYear,
    date: "2025-12-31",
  });
  expect((await summary(page, "month", "2025-12-31")).start).toBe("2025-12-01");
  expect((await summary(page, "month", "2025-12-31")).income).toBe("100.00");
  // The current week still lands first and still includes its future days.
  const landing = await summary(page);
  expect([landing.kind, landing.start, landing.end]).toEqual([
    "week",
    "2026-08-31",
    "2026-09-06",
  ]);
  expect([landing.expenses, landing.netChange]).toEqual(["3.00", "-3.00"]);
  expect(landing.entries).toHaveLength(1);
  const openMonth = await summary(page, "month", "2026-09-01");
  expect([openMonth.start, openMonth.end, openMonth.expenses]).toEqual([
    "2026-09-01",
    "2026-09-30",
    "3.00",
  ]);
  // An empty period reports zeros and fabricates nothing.
  const empty = await summary(page, "day", "2026-08-30");
  expect([empty.income, empty.expenses, empty.netChange]).toEqual([
    "0.00",
    "0.00",
    "0.00",
  ]);
  expect([empty.entries, empty.breakdown]).toEqual([[], []]);
});

test("every historical summary reconciles its own rows, including uncategorized and archived categories", async ({
  page,
}) => {
  await atMidday(page);
  const categories = (await summary(page)).categories;
  const groceries = categories.find(
    (category: { name: string }) => category.name === "Groceries",
  );
  const salary = categories.find(
    (category: { name: string }) => category.name === "Salary",
  );
  for (let day = 1; day <= 30; day++) {
    const date = `2026-06-${String(day).padStart(2, "0")}`;
    await post(page, { date, amount: "2", categoryId: groceries.id });
    await post(page, { date, amount: "1" });
  }
  await post(page, {
    date: "2026-06-15",
    amount: "10",
    kind: "refund",
    categoryId: groceries.id,
  });
  await post(page, {
    date: "2026-06-15",
    amount: "500",
    kind: "income",
    categoryId: salary.id,
  });
  await pool.query("UPDATE category SET active=false WHERE id=$1", [
    groceries.id,
  ]);
  const june = await summary(page, "month", "2026-06-30");
  // Whole-month summaries carry every row, not one page of them.
  expect(june.entries).toHaveLength(62);
  expect([june.income, june.expenses, june.netChange]).toEqual([
    "500.00",
    "80.00",
    "420.00",
  ]);
  expect(
    [...june.breakdown].sort(
      (left: { category: string }, right: { category: string }) =>
        left.category.localeCompare(right.category),
    ),
  ).toEqual([
    { categoryId: groceries.id, category: "Groceries", amount: "50.00" },
    { categoryId: null, category: "Uncategorized", amount: "30.00" },
  ]);
  const sum = june.entries.reduce(
    (total: number, entry: { kind: string; amount: string }) =>
      total +
      Number(entry.amount) *
        (entry.kind === "income" ? 0 : entry.kind === "refund" ? -1 : 1),
    0,
  );
  expect(sum.toFixed(2)).toBe(june.expenses);
  // The archived category stays out of new choices but keeps its history.
  expect(
    june.categories.some(
      (category: { id: string }) => category.id === groceries.id,
    ),
  ).toBe(false);
  const day = await summary(page, "day", "2026-06-15");
  expect([day.income, day.expenses, day.entries.length]).toEqual([
    "500.00",
    "-7.00",
    4,
  ]);
});

test("period navigation moves one period at a time and returns to the current one", async ({
  page,
}) => {
  await history(page);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("This week");
  await expect(page.getByText("2026-08-31 – 2026-09-06")).toBeVisible();
  await choose(page, "Period", "Month");
  await expect(heading).toHaveText("This month");
  await expect(page.getByText("2026-09-01 – 2026-09-30")).toBeVisible();
  // Previous steps back exactly one month and shows that month's figures.
  await page.getByRole("button", { name: "Previous period", exact: true }).click();
  await expect(heading).toHaveText("August 2026");
  await expect(page.getByText("2026-08-01 – 2026-08-31")).toBeVisible();
  await expect(page.getByText("MXN 25.00").first()).toBeVisible();
  // A month ending on the 31st steps to a shorter February, leap year included.
  await page.getByLabel("Jump to date").fill("2024-01-31");
  await expect(heading).toHaveText("January 2024");
  await page.getByRole("button", { name: "Next period", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("February 2024");
  await expect(page.getByText("2024-02-01 – 2024-02-29")).toBeVisible();
  // Changing granularity keeps the anchor date instead of jumping elsewhere.
  await choose(page, "Period", "Week");
  await expect(heading).toHaveText("Jan 29, 2024 – Feb 4, 2024");
  await choose(page, "Period", "Day");
  await expect(heading).toHaveText("Thursday, February 1, 2024");
  await expect(page.getByText("2024-02-01 – 2024-02-01")).toBeVisible();
  await expect(
    page.getByText("Nothing here yet", { exact: true }),
  ).toBeVisible();
  // A week crossing New Year steps back across the year boundary.
  await choose(page, "Period", "Week");
  await page.getByLabel("Jump to date").fill("2026-01-01");
  await expect(heading).toHaveText("Dec 29, 2025 – Jan 4, 2026");
  await expect(page.getByText("MXN 100.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous period", exact: true }).click();
  await expect(heading).toHaveText("Dec 22, 2025 – Dec 28, 2025");
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(heading).toHaveText("Dec 29, 2025 – Jan 4, 2026");
  // Back to current period recalculates today, across a Mexico City midnight.
  await moveClockTo("2026-09-02T06:01:00Z");
  await page
    .getByRole("button", { name: "Go to current period", exact: true })
    .click();
  await expect(heading).toHaveText("This week");
  await expect(page.getByText("2026-08-31 – 2026-09-06")).toBeVisible();
  await choose(page, "Period", "Day");
  await expect(heading).toHaveText("Today");
  await expect(page.getByText("2026-09-02 – 2026-09-02")).toBeVisible();
});

test("the browser time zone never decides which period is current", async ({
  browser,
}) => {
  // Kiritimati is a day ahead of Mexico City at this instant.
  const context = await browser.newContext({
    baseURL: origin,
    timezoneId: "Pacific/Kiritimati",
  });
  const page = await context.newPage();
  await atMidday(page);
  await moveClockTo("2026-09-02T05:00:00Z");
  await page
    .getByRole("button", { name: "Go to current period", exact: true })
    .click();
  await choose(page, "Period", "Day");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today");
  await expect(page.getByText("2026-09-01 – 2026-09-01")).toBeVisible();
  await expect(page.getByLabel("Jump to date")).toHaveValue("2026-09-01");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await expect(page.getByLabel("Movement date", { exact: true })).toHaveValue(
    "2026-09-01",
  );
  await context.close();
});

test("the server rejects unauthorized and unresolvable period requests", async ({
  page,
  request,
}) => {
  await atMidday(page);
  expect((await request.get("/api/journal?granularity=month")).status()).toBe(
    401,
  );
  expect((await request.get("/api/journal?granularity=quarter")).status()).toBe(
    401,
  );
  for (const query of [
    "kind=quarter",
    "kind=year",
    "kind=",
    "kind=Week",
    "date=2026-02-30",
    "date=2025-02-29",
    "date=0000-01-01",
    "date=2026-9-1",
    "date=yesterday",
    "kind=day&date=",
    "kind=month&date=2026-13-01",
  ])
    expect((await page.request.get(`/api/journal?${query}`)).status()).toBe(
      400,
    );
  for (const query of [
    "kind=day&date=2026-09-01",
    "kind=month&date=2024-02-29",
    "date=2024-02-29",
    "kind=week",
    "",
  ])
    expect((await page.request.get(`/api/journal?${query}`)).status()).toBe(
      200,
    );
  // A future period is browsable and simply has nothing recorded in it.
  const ahead = await summary(page, "month", "2027-03-10");
  expect([ahead.start, ahead.end, ahead.expenses, ahead.entries]).toEqual([
    "2027-03-01",
    "2027-03-31",
    "0.00",
    [],
  ]);
});

test("a failed period load keeps labels, figures and the selection coherent", async ({
  page,
}) => {
  await atMidday(page);
  await post(page, { date: "2026-09-01", amount: "4" });
  await page.reload();
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("This week");
  await pool.query(
    "ALTER TABLE financial_movement RENAME TO unavailable_financial_movement",
  );
  try {
    await page.getByRole("button", { name: "Previous period", exact: true }).click();
    const alert = page
      .getByRole("alert")
      .filter({ hasText: "We couldn't load that period" });
    await expect(alert).toContainText("Aug 24, 2026 – Aug 30, 2026");
    await expect(alert).toContainText("Aug 31, 2026 – Sep 6, 2026");
    // Nothing is relabelled: the figures still describe the week that loaded.
    await expect(heading).toHaveText("This week");
    await expect(page.getByText("2026-08-31 – 2026-09-06")).toBeVisible();
    await expect(page.getByText("MXN 4.00").first()).toBeVisible();
  } finally {
    await pool.query(
      "ALTER TABLE unavailable_financial_movement RENAME TO financial_movement",
    );
  }
  // Navigation stays usable, and retrying loads the period still selected.
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(heading).toHaveText("Aug 24, 2026 – Aug 30, 2026");
  await page
    .getByRole("button", { name: "Go to current period", exact: true })
    .click();
  await expect(heading).toHaveText("This week");
  await expect(page.getByText("MXN 4.00").first()).toBeVisible();
});
