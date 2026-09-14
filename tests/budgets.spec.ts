import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  appOrigin,
  choose,
  expectRefusal,
  moveClockTo,
  nativeClient,
  nativeSignIn,
  resetClock,
  signIn,
} from "./helpers";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async () => {
  await pool.query(
    "TRUNCATE budget, financial_movement, category, category_seed",
  );
});
test.afterAll(async () => {
  await pool.end();
  await resetClock();
});
// Requests carry no viewport, so HTTP cases are exercised once.
function desktopOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "desktop");
}
// Mexico City midday on Wednesday 9 September 2026, in the week of 7–13
// September. It stays before the real date: sign-in advances the server clock
// from the latest offset, so a future one would outlive session-expiry cases.
const midday = "2026-09-09T18:00:00Z";
async function atMidday(page: Page) {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo(midday);
}
function put(
  page: Page,
  query: string,
  data: unknown,
  headers: Record<string, string> = { Origin: appOrigin },
) {
  return page.request.put(`/api/budgets${query}`, { headers, data });
}
async function setBudget(page: Page, query: string, amount: string) {
  const response = await put(page, query, { amount, oneOff: false });
  expect(response.status()).toBe(200);
  const reply = await response.json();
  expect(reply.saved).toBe(true);
  return reply.budget;
}
async function summary(page: Page, query = "") {
  const response = await page.request.get(`/api/journal${query}`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function record(page: Page, fields: Record<string, unknown>) {
  const response = await page.request.post("/api/journal", {
    headers: { Origin: appOrigin },
    data: {
      id: randomUUID(),
      kind: "expense",
      amount: "1.00",
      date: "2026-09-09",
      categoryId: null,
      note: "",
      ...fields,
    },
  });
  expect(response.status()).toBe(200);
}

test("a repeating budget applies from its own period onward, and days, weeks and months are independent", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  const week = await setBudget(page, "?kind=week&date=2026-09-09", "2000");
  expect(week).toEqual({
    kind: "week",
    start: "2026-09-07",
    end: "2026-09-13",
    amount: "2000.00",
    repeats: true,
    expenses: "0.00",
    remaining: "2000.00",
    overBudget: false,
    daysLeft: null,
    leftPerDay: null,
  });
  // The landing summary, the current week, carries the same view.
  expect((await summary(page)).budget).toEqual(week);
  const amountOn = async (query: string) =>
    (await summary(page, query)).budget?.amount ?? null;
  expect(await amountOn("?kind=week&date=2026-09-06")).toBeNull();
  expect(await amountOn("?kind=week&date=2026-09-14")).toBe("2000.00");
  expect(await amountOn("?kind=week&date=2027-01-01")).toBe("2000.00");
  expect(await amountOn("?kind=day&date=2026-09-09")).toBeNull();
  expect(await amountOn("?kind=month&date=2026-09-09")).toBeNull();

  // A month and a day budget overlap the week without touching it.
  expect(
    await setBudget(page, "?kind=month&date=2026-09-30", "8000"),
  ).toMatchObject({
    kind: "month",
    start: "2026-09-01",
    end: "2026-09-30",
    amount: "8000.00",
  });
  expect(
    await setBudget(page, "?kind=day&date=2026-09-09", "300"),
  ).toMatchObject({
    kind: "day",
    start: "2026-09-09",
    end: "2026-09-09",
    amount: "300.00",
  });
  expect(await amountOn("?kind=month&date=2026-08-31")).toBeNull();
  expect(await amountOn("?kind=month&date=2027-02-14")).toBe("8000.00");
  expect(await amountOn("?kind=day&date=2026-09-08")).toBeNull();
  expect(await amountOn("?kind=day&date=2026-09-10")).toBe("300.00");
  expect(await amountOn("?kind=week&date=2026-09-09")).toBe("2000.00");

  // Any date in the week where the budget starts replaces its amount onward,
  // and retrying the same request changes nothing further.
  const replaced = await (
    await put(page, "?kind=week&date=2026-09-12", {
      amount: "2500.5",
      oneOff: false,
    })
  ).json();
  expect(replaced).toEqual({
    saved: true,
    budget: { ...week, amount: "2500.50", remaining: "2500.50" },
  });
  expect(
    await (
      await put(page, "?kind=week&date=2026-09-12", {
        amount: "2500.5",
        oneOff: false,
      })
    ).json(),
  ).toEqual(replaced);
  expect(await amountOn("?kind=week&date=2026-09-06")).toBeNull();
  expect(await amountOn("?kind=week&date=2026-10-26")).toBe("2500.50");

  // An amount set from a later week takes over from that week.
  expect(
    await setBudget(page, "?kind=week&date=2026-10-07", "1800"),
  ).toMatchObject({ start: "2026-10-05", amount: "1800.00" });
  expect(await amountOn("?kind=week&date=2026-09-09")).toBe("2500.50");
  expect(await amountOn("?kind=week&date=2026-09-28")).toBe("2500.50");
  expect(await amountOn("?kind=week&date=2026-11-30")).toBe("1800.00");
});

test("a budget measures the summary's total expenses, where refunds give room back and income never adds to it", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  const { categories } = await summary(page);
  const named = (name: string) =>
    categories.find((category: { name: string }) => category.name === name).id;
  // Spending recorded before the budget is set counts, including uncategorized
  // spending and spending in a category archived since.
  await record(page, {
    date: "2026-09-07",
    amount: "300",
    categoryId: named("Groceries"),
  });
  await record(page, { date: "2026-09-08", amount: "200" });
  await record(page, {
    date: "2026-09-08",
    kind: "income",
    amount: "5000",
    categoryId: named("Salary"),
  });
  await record(page, {
    date: "2026-09-08",
    amount: "100",
    categoryId: named("Dining"),
  });
  expect(
    (
      await page.request.post("/api/categories", {
        headers: { Origin: appOrigin },
        data: { action: "archive", id: named("Dining") },
      })
    ).status(),
  ).toBe(200);
  // A purchase last week refunded this week gives room back to this week.
  await record(page, {
    date: "2026-09-03",
    amount: "400",
    categoryId: named("Groceries"),
  });
  await record(page, {
    date: "2026-09-09",
    kind: "refund",
    amount: "150",
    categoryId: named("Groceries"),
  });
  const budget = await setBudget(page, "?kind=week&date=2026-09-09", "1000");
  expect(budget).toMatchObject({
    amount: "1000.00",
    expenses: "450.00",
    remaining: "550.00",
    overBudget: false,
  });
  const week = await summary(page, "?kind=week&date=2026-09-09");
  expect(week.budget).toEqual(budget);
  expect(week.budget.expenses).toBe(week.expenses);
  const before = await summary(page, "?kind=week&date=2026-09-03");
  expect([before.expenses, before.budget]).toEqual(["400.00", null]);

  // Spending exactly the budget leaves nothing without being over it.
  await record(page, { date: "2026-09-07", amount: "550" });
  expect(
    (await summary(page, "?kind=week&date=2026-09-09")).budget,
  ).toMatchObject({ expenses: "1000.00", remaining: "0.00", overBudget: false });
  await record(page, { date: "2026-09-07", amount: "0.01" });
  expect(
    (await summary(page, "?kind=week&date=2026-09-09")).budget,
  ).toMatchObject({ expenses: "1000.01", remaining: "-0.01", overBudget: true });

  // A zero budget: refunds outweighing a day's expenses leave more than the
  // budget itself, and nothing spent leaves exactly nothing.
  expect(
    await setBudget(page, "?kind=day&date=2026-09-09", "0"),
  ).toMatchObject({
    amount: "0.00",
    expenses: "-150.00",
    remaining: "150.00",
    overBudget: false,
  });
  expect(
    (await summary(page, "?kind=day&date=2026-09-10")).budget,
  ).toMatchObject({ expenses: "0.00", remaining: "0.00", overBudget: false });
  await record(page, { date: "2026-09-09", amount: "200" });
  const day = await summary(page, "?kind=day&date=2026-09-09");
  expect(day.budget).toMatchObject({
    expenses: "50.00",
    remaining: "-50.00",
    overBudget: true,
  });
  expect(day.budget.expenses).toBe(day.expenses);
});

test("setting a budget refuses unauthorized requests, unresolvable periods and invalid fields without saving anything", async ({
  page,
  request,
}, testInfo) => {
  desktopOnly(testInfo);
  const valid = { amount: "10", oneOff: false };
  await expectRefusal(
    await request.put("/api/budgets", {
      headers: { Origin: appOrigin },
      data: valid,
    }),
    "unauthenticated",
    401,
  );
  await atMidday(page);
  await expectRefusal(
    await put(page, "", valid, { Origin: "https://attacker.example" }),
    "request_not_allowed",
    403,
  );
  // A cookie write must name this app's Origin, and every write carries JSON.
  await expectRefusal(await put(page, "", valid, {}), "request_not_allowed", 403);
  await expectRefusal(
    await put(page, "", JSON.stringify(valid), {
      Origin: appOrigin,
      "Content-Type": "text/plain",
    }),
    "request_not_allowed",
    403,
  );
  await expectRefusal(
    await put(page, "", valid, {
      Origin: appOrigin,
      "X-Finance-Buddy-Build": "11",
    }),
    "upgrade_required",
    426,
  );
  for (const query of ["?kind=quarter", "?kind=month&date=2026-02-30", "?date="])
    await expectRefusal(await put(page, query, valid), "invalid_period", 400);
  for (const [data, field] of [
    [{ amount: "-1", oneOff: false }, "amount"],
    [{ amount: "1.234", oneOff: false }, "amount"],
    [{ amount: "1000000000000", oneOff: false }, "amount"],
    [{ amount: 10, oneOff: false }, "amount"],
    [{ amount: "", oneOff: false }, "amount"],
    [{ oneOff: false }, "amount"],
    [{ amount: "10" }, "oneOff"],
    [{ amount: "10", oneOff: "false" }, "oneOff"],
    [{ amount: "10", oneOff: null }, "oneOff"],
    [{ amount: "10", oneOff: true }, "oneOff"],
    ["not a budget", null],
  ] as const) {
    const response = await put(page, "?kind=week", data, {
      Origin: appOrigin,
      "Content-Type": "application/json",
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "invalid_field",
      field,
    });
  }
  // A write whose outcome is unknown says so, and is safe to retry.
  await pool.query("ALTER TABLE budget RENAME TO unavailable_budget");
  try {
    await expectRefusal(await put(page, "?kind=week", valid), "not_confirmed", 503);
  } finally {
    await pool.query("ALTER TABLE unavailable_budget RENAME TO budget");
  }
  expect((await summary(page, "?kind=week")).budget).toBeNull();
  expect(
    await setBudget(page, "?kind=week&date=2026-09-09", "10"),
  ).toMatchObject({ amount: "10.00" });
});

test("another person can neither see nor change the owner's budgets", async ({
  page,
  browser,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  const mine = await setBudget(page, "?kind=week&date=2026-09-09", "2000");
  const other = await browser.newContext({ baseURL: appOrigin });
  try {
    const stranger = await other.newPage();
    await signIn(stranger, "stranger");
    await expect(
      stranger.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    await moveClockTo(midday);
    expect(
      (await summary(stranger, "?kind=week&date=2026-09-09")).budget,
    ).toBeNull();
    expect(
      await setBudget(stranger, "?kind=week&date=2026-09-09", "10"),
    ).toMatchObject({ amount: "10.00", expenses: "0.00" });
    expect(
      (await summary(page, "?kind=week&date=2026-09-09")).budget,
    ).toEqual(mine);
    expect(
      (await summary(stranger, "?kind=week&date=2026-09-14")).budget.amount,
    ).toBe("10.00");
  } finally {
    await other.close();
  }
});

test("a native client sets a budget with its bearer token and reads it in the summary", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  const { bearer } = await nativeSignIn();
  await moveClockTo(midday);
  const app = nativeClient(bearer);
  const response = await app("/api/budgets?kind=week&date=2026-09-09", {
    method: "PUT",
    body: { amount: "1200", oneOff: false },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const { saved, budget } = await response.json();
  expect(saved).toBe(true);
  expect(budget).toMatchObject({
    kind: "week",
    start: "2026-09-07",
    amount: "1200.00",
    repeats: true,
  });
  const read = await app("/api/journal?kind=week&date=2026-09-09");
  expect((await read.json()).budget).toEqual(budget);
  // The web reads the same budget the app set.
  expect(
    (await summary(page, "?kind=week&date=2026-09-09")).budget,
  ).toEqual(budget);
});

test("the dashboard shows the selected period's budget read-only and follows the period on screen", async ({
  page,
}, testInfo) => {
  await atMidday(page);
  await record(page, { date: "2026-09-08", amount: "1500" });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "This week", level: 1 }),
  ).toBeVisible();
  const card = page.getByRole("region", { name: "Budget", exact: true });
  await expect(card).toContainText("No budget for this week.");
  await expect(card.getByRole("link", { name: "Budgets" })).toHaveAttribute(
    "href",
    "/budgets",
  );

  await setBudget(page, "?kind=week&date=2026-09-09", "2000");
  await page.reload();
  await expect(card.getByText("MXN 500.00 left", { exact: true })).toBeVisible();
  await expect(card.getByText("MXN 2,000.00", { exact: true })).toBeVisible();
  await expect(card.getByText("MXN 1,500.00", { exact: true })).toBeVisible();
  // Nothing on the card changes a budget.
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByRole("textbox")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("budget-card.png"),
    fullPage: true,
  });

  // The card describes whichever period is on screen.
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aug 31, 2026 – Sep 6, 2026", level: 1 }),
  ).toBeVisible();
  await expect(card).toContainText("No budget for this week.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This week", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sep 14, 2026 – Sep 20, 2026", level: 1 }),
  ).toBeVisible();
  await expect(
    card.getByText("MXN 2,000.00 left", { exact: true }),
  ).toBeVisible();
  await choose(page, "Period", "Month");
  await expect(
    page.getByRole("heading", { name: "This month", level: 1 }),
  ).toBeVisible();
  await expect(card).toContainText("No budget for this month.");

  // Overspending reads as the excess, not a negative amount left.
  await record(page, { date: "2026-09-09", amount: "600" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "This week", level: 1 }),
  ).toBeVisible();
  await expect(
    card.getByText("Over by MXN 100.00", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});
