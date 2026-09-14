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
  notification,
  openNavigation,
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
function entry(fields: Record<string, unknown>) {
  return {
    id: randomUUID(),
    kind: "expense",
    amount: "1.00",
    date: "2026-09-09",
    categoryId: null,
    note: "",
    ...fields,
  };
}
async function record(
  page: Page,
  fields: Record<string, unknown>,
  method: "post" | "patch" = "post",
) {
  const response = await page.request[method]("/api/journal", {
    headers: { Origin: appOrigin },
    data: entry(fields),
  });
  expect(response.status()).toBe(200);
  return response.json();
}

test("saving an expense or refund replies with the budget of the shortest budgeted period containing its date", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  // Nothing budgeted: the reply is exactly what it always was.
  expect(await record(page, { date: "2026-09-09", amount: "100" })).toEqual({
    saved: true,
  });
  await setBudget(page, "?kind=week&date=2026-09-09", "2000");
  await setBudget(page, "?kind=month&date=2026-09-09", "8000");

  // No day budget, so the week is the shortest budgeted period, read after the
  // entry commits; retrying the same request replies the same way.
  const repeated = entry({ date: "2026-09-08", amount: "300" });
  const first = await record(page, repeated);
  expect(first).toEqual({
    saved: true,
    budget: {
      kind: "week",
      start: "2026-09-07",
      end: "2026-09-13",
      amount: "2000.00",
      repeats: true,
      expenses: "400.00",
      remaining: "1600.00",
      overBudget: false,
      daysLeft: 5,
      leftPerDay: "320.00",
    },
  });
  expect(await record(page, repeated)).toEqual(first);

  // A day budget from today is shorter than the week.
  await setBudget(page, "?kind=day&date=2026-09-09", "500");
  expect(
    (await record(page, { date: "2026-09-09", amount: "200" })).budget,
  ).toMatchObject({ kind: "day", expenses: "300.00", remaining: "200.00" });
  // A refund's reply shows the room it gave back.
  expect(
    (await record(page, { date: "2026-09-09", kind: "refund", amount: "50" }))
      .budget,
  ).toMatchObject({ kind: "day", expenses: "250.00", remaining: "250.00" });
  // Yesterday had no day budget, so the week answers, now overspent.
  expect(
    (await record(page, { date: "2026-09-08", amount: "1900" })).budget,
  ).toMatchObject({
    kind: "week",
    expenses: "2450.00",
    remaining: "-450.00",
    overBudget: true,
    leftPerDay: null,
  });
  // Income never carries a budget.
  expect(
    await record(page, { date: "2026-09-09", kind: "income", amount: "5000" }),
  ).toEqual({ saved: true });

  // A past-dated expense reports its own period: last week had no budget, so
  // its month does.
  const past = entry({ date: "2026-09-03", amount: "40" });
  expect((await record(page, past)).budget).toMatchObject({
    kind: "month",
    start: "2026-09-01",
    expenses: "2490.00",
    remaining: "5510.00",
    daysLeft: 22,
    leftPerDay: "250.45",
  });
  // August has no budget of any kind.
  expect(await record(page, { date: "2026-08-20", amount: "10" })).toEqual({
    saved: true,
  });

  // A correction reports the corrected entry: moved to today as a refund, then
  // changed into income.
  const moved = await record(
    page,
    { ...past, date: "2026-09-09", kind: "refund" },
    "patch",
  );
  expect(moved.budget).toMatchObject({
    kind: "day",
    expenses: "210.00",
    remaining: "290.00",
  });
  expect(moved.budget).toEqual(
    (await summary(page, "?kind=day&date=2026-09-09")).budget,
  );
  expect(
    await record(page, { ...past, date: "2026-09-09", kind: "income" }, "patch"),
  ).toEqual({ saved: true });

  // A native client receives the same budget after recording an expense.
  const { bearer } = await nativeSignIn();
  await moveClockTo(midday);
  const response = await nativeClient(bearer)("/api/journal", {
    method: "POST",
    body: entry({ date: "2026-09-09", amount: "10" }),
  });
  expect(response.status).toBe(200);
  expect((await response.json()).budget).toMatchObject({
    kind: "day",
    expenses: "260.00",
    remaining: "240.00",
  });
});

test("the confirmation after recording an expense says how much of its budget is left", async ({
  page,
}, testInfo) => {
  await atMidday(page);
  await setBudget(page, "?kind=week&date=2026-09-09", "2000");
  await page.goto("/");
  const add = async (amount: string, date?: string) => {
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    await choose(page, "Type", "Expense");
    await page.getByLabel("Amount (MXN)").fill(amount);
    if (date) await page.getByLabel("Movement date").fill(date);
    await page.getByRole("button", { name: "Save entry", exact: true }).click();
  };
  await add("300");
  await expect(
    notification(page, "Entry saved. MXN 1,700.00 left this week."),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("entry-toast-budget.png"),
    fullPage: true,
  });
  // Neither last week nor September has a budget, so the confirmation carries
  // no budget line.
  await add("20", "2026-09-01");
  const outside = notification(page, "outside the period you are viewing");
  await expect(outside).toBeVisible();
  await expect(outside).not.toContainText("left");
  // Today's MXN 300 and MXN 150 exceed a MXN 400 day budget.
  await setBudget(page, "?kind=day&date=2026-09-09", "400");
  await add("150");
  await expect(
    notification(page, "Entry saved. Over by MXN 50.00 today."),
  ).toBeVisible();
});

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
    daysLeft: 5,
    leftPerDay: "400.00",
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
    budget: {
      ...week,
      amount: "2500.50",
      remaining: "2500.50",
      leftPerDay: "500.10",
    },
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

test("left per day shares the remaining budget across the days left in the current week or month, counting today", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  // Set while an earlier week and month were current, so the same budgets also
  // cover periods that have ended since.
  await moveClockTo("2026-08-31T18:00:00Z");
  await setBudget(page, "?kind=week", "1000");
  await setBudget(page, "?kind=month", "3000");
  await moveClockTo(midday);
  await setBudget(page, "?kind=day", "300");
  await record(page, { date: "2026-09-08", amount: "0.03" });
  const figures = async (query: string) => {
    const { budget } = await summary(page, query);
    return [budget.remaining, budget.daysLeft, budget.leftPerDay];
  };
  // Wednesday through Sunday is five days; 999.97 ÷ 5 rounds down to 199.99.
  expect(await figures("?kind=week&date=2026-09-09")).toEqual([
    "999.97",
    5,
    "199.99",
  ]);
  // The 9th through the 30th is twenty-two days; 2,999.97 ÷ 22 is 136.362….
  expect(await figures("?kind=month&date=2026-09-09")).toEqual([
    "2999.97",
    22,
    "136.36",
  ]);
  // Day budgets, ended periods and future periods have no left per day.
  expect(await figures("?kind=day&date=2026-09-09")).toEqual([
    "300.00",
    null,
    null,
  ]);
  for (const query of [
    "?kind=week&date=2026-09-06",
    "?kind=week&date=2026-09-14",
    "?kind=month&date=2026-08-31",
    "?kind=month&date=2026-10-01",
  ])
    expect((await figures(query)).slice(1)).toEqual([null, null]);

  // Spending exactly the budget leaves nothing per day; over budget shows the
  // overspend instead of a daily figure.
  await record(page, { date: "2026-09-09", amount: "999.97" });
  expect(await figures("?kind=week&date=2026-09-09")).toEqual([
    "0.00",
    5,
    "0.00",
  ]);
  await record(page, { date: "2026-09-09", amount: "0.01" });
  const over = (await summary(page, "?kind=week&date=2026-09-09")).budget;
  expect(over).toMatchObject({
    overBudget: true,
    remaining: "-0.01",
    daysLeft: null,
    leftPerDay: null,
  });
  // The month still has room: 1,999.99 ÷ 22 is 90.908….
  expect(await figures("?kind=month&date=2026-09-09")).toEqual([
    "1999.99",
    22,
    "90.90",
  ]);
  // A budget write replies with the same figures: 1,199.99 ÷ 22 is 54.545….
  expect(
    await setBudget(page, "?kind=month&date=2026-09-09", "2200"),
  ).toMatchObject({ remaining: "1199.99", daysLeft: 22, leftPerDay: "54.54" });
});

test("left per day follows Mexico City days across week and month edges", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  const current = async (kind: string) => {
    const { today, start, budget } = await summary(page, `?kind=${kind}`);
    return [today, start, budget.daysLeft, budget.leftPerDay];
  };
  // 23:59 on Saturday 31 January in Mexico City, already February in UTC: the
  // last day of a month leaves its whole remaining budget for today.
  await moveClockTo("2026-02-01T05:59:00Z");
  await setBudget(page, "?kind=month", "3100");
  expect(await current("month")).toEqual([
    "2026-01-31",
    "2026-01-01",
    1,
    "3100.00",
  ]);
  // From the 31st into a twenty-eight-day February: 3,100 ÷ 28 is 110.714….
  await moveClockTo("2026-02-01T06:00:00Z");
  expect(await current("month")).toEqual([
    "2026-02-01",
    "2026-02-01",
    28,
    "110.71",
  ]);
  // 23:59 on Sunday 30 August in Mexico City, already Monday in UTC: the last
  // day of the week leaves its whole remaining budget for today.
  await moveClockTo("2026-08-31T05:59:00Z");
  await setBudget(page, "?kind=week", "700");
  expect(await current("week")).toEqual([
    "2026-08-30",
    "2026-08-24",
    1,
    "700.00",
  ]);
  expect(await current("month")).toEqual([
    "2026-08-30",
    "2026-08-01",
    2,
    "1550.00",
  ]);
  // Midnight in Mexico City starts a new week on its first day, and the 31st is
  // the last day of August.
  await moveClockTo("2026-08-31T06:00:00Z");
  expect(await current("week")).toEqual([
    "2026-08-31",
    "2026-08-31",
    7,
    "100.00",
  ]);
  expect(await current("month")).toEqual([
    "2026-08-31",
    "2026-08-01",
    1,
    "3100.00",
  ]);
  const ended = (await summary(page, "?kind=week&date=2026-08-30")).budget;
  expect([ended.daysLeft, ended.leftPerDay]).toEqual([null, null]);
  // The first day of a thirty-day month: 3,100 ÷ 30 is 103.333….
  await moveClockTo("2026-09-01T06:00:00Z");
  expect(await current("month")).toEqual([
    "2026-09-01",
    "2026-09-01",
    30,
    "103.33",
  ]);
});

test("the budgets list shows today's day, week and month budgets as of Mexico City's today", async ({
  page,
  request,
}, testInfo) => {
  desktopOnly(testInfo);
  await expectRefusal(
    await request.get("/api/budgets"),
    "unauthenticated",
    401,
  );
  await atMidday(page);
  const list = async () => {
    const response = await page.request.get("/api/budgets");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    return response.json();
  };
  expect(await list()).toEqual({
    today: "2026-09-09",
    currency: "MXN",
    now: { day: null, week: null, month: null },
    repeating: [],
    upcoming: [],
    past: [],
    nextBefore: null,
  });
  await expectRefusal(
    await page.request.get("/api/budgets", {
      headers: { Origin: "https://attacker.example" },
    }),
    "request_not_allowed",
    403,
  );

  await record(page, { date: "2026-09-08", amount: "500" });
  await setBudget(page, "?kind=week&date=2026-09-09", "2000");
  await setBudget(page, "?kind=month&date=2026-09-09", "8000");
  const listed = await list();
  const { now } = listed;
  expect(listed.repeating).toEqual([
    { kind: "week", start: "2026-09-07", amount: "2000.00", until: null },
    { kind: "month", start: "2026-09-01", amount: "8000.00", until: null },
  ]);
  expect(now.day).toBeNull();
  expect(now.week).toEqual((await summary(page, "?kind=week")).budget);
  expect(now.month).toEqual((await summary(page, "?kind=month")).budget);
  expect(now.week).toMatchObject({
    start: "2026-09-07",
    remaining: "1500.00",
    daysLeft: 5,
    leftPerDay: "300.00",
  });
  // Now follows the server's today, whenever the budgets were set.
  await moveClockTo("2026-09-08T18:00:00Z");
  const earlier = await list();
  expect(earlier.today).toBe("2026-09-08");
  expect(earlier.now.week).toMatchObject({ daysLeft: 6, leftPerDay: "250.00" });

  // A repeating span that has ended leaves the list, while the span that took
  // over from it stays, listed day before week before month.
  await setBudget(page, "?kind=day", "100");
  await moveClockTo(midday);
  await setBudget(page, "?kind=day", "200");
  const later = await list();
  expect(later.repeating).toEqual([
    { kind: "day", start: "2026-09-09", amount: "200.00", until: null },
    { kind: "week", start: "2026-09-07", amount: "2000.00", until: null },
    { kind: "month", start: "2026-09-01", amount: "8000.00", until: null },
  ]);
  expect(later.now.day).toMatchObject({ amount: "200.00" });
  await moveClockTo("2026-09-08T18:00:00Z");
  expect((await list()).repeating[0]).toEqual({
    kind: "day",
    start: "2026-09-08",
    amount: "100.00",
    until: "2026-09-08",
  });

  // Budgets that cannot be read are unavailable, never shown as none.
  await pool.query("ALTER TABLE budget RENAME TO unavailable_budget");
  try {
    await expectRefusal(
      await page.request.get("/api/budgets"),
      "unavailable",
      503,
    );
  } finally {
    await pool.query("ALTER TABLE unavailable_budget RENAME TO budget");
  }
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
      (await (await stranger.request.get("/api/budgets")).json()).now.week,
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
  const listed = await app("/api/budgets");
  expect(listed.status).toBe(200);
  expect((await listed.json()).now.week).toEqual(budget);
  // The web reads the same budget the app set.
  expect(
    (await summary(page, "?kind=week&date=2026-09-09")).budget,
  ).toEqual(budget);
});

test("Budgets sits between Dashboard and Categories in the navigation and explains budgets before the first one is set", async ({
  page,
}, testInfo) => {
  await atMidday(page);
  const sections = page.getByRole("navigation", { name: "Sections" });
  const link = sections.getByRole("link", { name: "Budgets", exact: true });
  await openNavigation(page, link);
  // No badge or count travels with the link.
  await expect(sections.getByRole("link")).toHaveText([
    "Entries",
    "Dashboard",
    "Budgets",
    "Categories",
    "Settings",
  ]);
  await link.click();
  await expect(
    page.getByRole("heading", { name: "Budgets", level: 1 }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/budgets$/);
  // On a phone the drawer closes once a section is chosen.
  if (testInfo.project.name === "phone") await expect(sections).toBeHidden();
  else await expect(link).toHaveAttribute("aria-current", "page");

  await expect(page.getByText("No budgets yet", { exact: true })).toBeVisible();
  await expect(page.getByText(/most you intend to spend/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Now", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("budgets-empty.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Set your first budget" }).click();
  const form = page.getByRole("region", { name: "Set budget", exact: true });
  await expect(form).toBeVisible();

  // A first budget that starts next week still ends the empty state, though
  // nothing applies today yet.
  await form.getByLabel("Date", { exact: true }).fill("2026-09-16");
  await expect(
    form.getByText("Week of 14–20 Sep", { exact: true }),
  ).toBeVisible();
  await form.getByLabel("Amount (MXN)", { exact: true }).fill("500");
  await form.getByRole("button", { name: "Save budget" }).click();
  const now = page.getByRole("region", { name: "Now", exact: true });
  await expect(now).toBeVisible();
  await expect(page.getByText("No budgets yet", { exact: true })).toHaveCount(0);
  await expect(
    now
      .getByRole("region", { name: "This week", exact: true })
      .getByRole("button", { name: "Set budget", exact: true }),
  ).toBeVisible();
});

test("a weekly budget set from the form appears in Now with what is left per day", async ({
  page,
}, testInfo) => {
  await atMidday(page);
  await record(page, { date: "2026-09-08", amount: "1500" });
  await page.goto("/budgets");
  await page.getByRole("button", { name: "Set your first budget" }).click();
  const form = page.getByRole("region", { name: "Set budget", exact: true });
  const amount = form.getByLabel("Amount (MXN)", { exact: true });
  const date = form.getByLabel("Date", { exact: true });
  const save = form.getByRole("button", { name: "Save budget" });
  // The form opens on the current week.
  await expect(form.getByLabel("Period", { exact: true })).toHaveText("Week");
  await expect(date).toHaveValue("2026-09-09");
  await expect(form.getByText("Week of 7–13 Sep", { exact: true })).toBeVisible();
  await expect(amount).toHaveValue("");

  await amount.fill("12.345");
  await save.click();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText(/up to two decimal places/)).toBeVisible();
  await amount.fill("2000");
  await save.click();
  await expect(
    notification(page, "Budget of MXN 2,000.00 saved for every week from 7 Sep."),
  ).toBeVisible();
  await expect(form).toHaveCount(0);

  const now = page.getByRole("region", { name: "Now", exact: true });
  const week = now.getByRole("region", { name: "This week", exact: true });
  await expect(week.getByText("MXN 500.00 left", { exact: true })).toBeVisible();
  await expect(week.getByText("Repeating", { exact: true })).toBeVisible();
  await expect(
    week.getByText("MXN 100.00 left per day", { exact: true }),
  ).toBeVisible();
  await expect(
    week.getByText("5 days left, counting today", { exact: true }),
  ).toBeVisible();
  for (const name of ["Today", "This month"])
    await expect(
      now
        .getByRole("region", { name, exact: true })
        .getByRole("button", { name: "Set budget", exact: true }),
    ).toBeVisible();
  await expect(page.getByText("No budgets yet", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("budgets-now.png"),
    fullPage: true,
  });

  // Each period in Now opens the form on itself, with the budget that already
  // applies to the chosen period filled in.
  await now
    .getByRole("region", { name: "This month", exact: true })
    .getByRole("button", { name: "Set budget", exact: true })
    .click();
  await expect(form.getByLabel("Period", { exact: true })).toHaveText("Month");
  await expect(form.getByText("September 2026", { exact: true })).toBeVisible();
  await expect(amount).toHaveValue("");
  await choose(page, "Period", "Week");
  await expect(form.getByText("Week of 7–13 Sep", { exact: true })).toBeVisible();
  await expect(amount).toHaveValue("2000.00");
  await date.fill("2026-09-16");
  await expect(
    form.getByText("Week of 14–20 Sep", { exact: true }),
  ).toBeVisible();
  await expect(amount).toHaveValue("2000.00");
  await expect(save).toBeEnabled();
  // A period that has ended keeps the budget it had.
  await date.fill("2026-09-01");
  await expect(
    form.getByText("Week of 31 Aug – 6 Sep", { exact: true }),
  ).toBeVisible();
  await expect(form.getByText(/This week has ended/)).toBeVisible();
  await expect(save).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("budgets-form-ended.png"),
    fullPage: true,
  });
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
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
  // Wednesday through Sunday leaves five days for the MXN 500.00 left.
  await expect(
    card.getByText("MXN 100.00 left per day", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("5 days left, counting today", { exact: true }),
  ).toBeVisible();
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
  // A week that has not started yet has no left per day.
  await expect(card.getByText(/left per day/)).toHaveCount(0);
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
  await expect(card.getByText(/left per day/)).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

function del(
  page: Page,
  query: string,
  data: unknown,
  headers: Record<string, string> = { Origin: appOrigin },
) {
  return page.request.delete(`/api/budgets${query}`, { headers, data });
}
async function stopBudget(page: Page, query: string) {
  const response = await del(page, query, { scope: "onward" });
  expect(response.status()).toBe(200);
  const reply = await response.json();
  expect(reply.saved).toBe(true);
  return reply.budget;
}
async function listed(page: Page) {
  const response = await page.request.get("/api/budgets");
  expect(response.status()).toBe(200);
  return response.json();
}

test("changing a repeating budget from a period onward keeps ended periods and stops at the next scheduled change", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  const months = () =>
    Promise.all(
      ["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10", "2026-12-10"].map(
        async (date) =>
          (await summary(page, `?kind=month&date=${date}`)).budget?.amount ??
          null,
      ),
    );
  // In May: MXN 1,000 a month from May, and MXN 8,000 scheduled from August.
  await moveClockTo("2026-05-15T18:00:00Z");
  await setBudget(page, "?kind=month", "1000");
  expect(
    await setBudget(page, "?kind=month&date=2026-08-20", "8000"),
  ).toMatchObject({
    start: "2026-08-01",
    amount: "8000.00",
    repeats: true,
    daysLeft: null,
  });
  expect(await months()).toEqual([
    "1000.00",
    "1000.00",
    "1000.00",
    "8000.00",
    "8000.00",
  ]);

  // In June, a change from the current month applies now, leaves May with the
  // amount it had, and stops before August's scheduled change.
  await moveClockTo("2026-06-15T18:00:00Z");
  const june = { amount: "3000", oneOff: false };
  const changed = await (await put(page, "?kind=month", june)).json();
  expect(changed).toEqual({
    saved: true,
    budget: {
      kind: "month",
      start: "2026-06-01",
      end: "2026-06-30",
      amount: "3000.00",
      repeats: true,
      expenses: "0.00",
      remaining: "3000.00",
      overBudget: false,
      daysLeft: 16,
      leftPerDay: "187.50",
    },
  });
  expect(await (await put(page, "?kind=month", june)).json()).toEqual(changed);
  expect(await months()).toEqual([
    "1000.00",
    "3000.00",
    "3000.00",
    "8000.00",
    "8000.00",
  ]);
  // A change from a future month takes over from there, still before August.
  await setBudget(page, "?kind=month&date=2026-07-31", "3500");
  expect(await months()).toEqual([
    "1000.00",
    "3000.00",
    "3500.00",
    "8000.00",
    "8000.00",
  ]);
  expect((await listed(page)).repeating).toEqual([
    { kind: "month", start: "2026-06-01", amount: "3000.00", until: "2026-06-01" },
    { kind: "month", start: "2026-07-01", amount: "3500.00", until: "2026-07-01" },
    { kind: "month", start: "2026-08-01", amount: "8000.00", until: null },
  ]);

  // Ended periods are read-only, with or without a budget.
  await expectRefusal(
    await put(page, "?kind=month&date=2026-05-31", june),
    "period_ended",
    409,
  );
  await expectRefusal(
    await del(page, "?kind=month&date=2026-05-31", { scope: "onward" }),
    "period_ended",
    409,
  );
  await expectRefusal(
    await put(page, "?kind=day&date=2026-06-14", june),
    "period_ended",
    409,
  );
  // 23:59 on 30 June in Mexico City still changes June; a minute later it
  // has ended.
  await moveClockTo("2026-07-01T05:59:00Z");
  expect(await setBudget(page, "?kind=month", "3100")).toMatchObject({
    start: "2026-06-01",
    amount: "3100.00",
    daysLeft: 1,
    leftPerDay: "3100.00",
  });
  await moveClockTo("2026-07-01T06:00:00Z");
  await expectRefusal(
    await put(page, "?kind=month&date=2026-06-30", june),
    "period_ended",
    409,
  );
  expect(await months()).toEqual([
    "1000.00",
    "3100.00",
    "3500.00",
    "8000.00",
    "8000.00",
  ]);
});

test("stopping a repeating budget ends it and its scheduled changes from that period, while ended periods keep theirs", async ({
  page,
  request,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  const amountOn = async (query: string) =>
    (await summary(page, query)).budget?.amount ?? null;
  await moveClockTo("2026-07-15T18:00:00Z");
  await setBudget(page, "?kind=week", "700");
  await setBudget(page, "?kind=week&date=2026-08-05", "900");
  await setBudget(page, "?kind=day", "100");

  // A week later, stopping from the current week ends the budget begun the
  // week before and removes the change scheduled for August.
  await moveClockTo("2026-07-22T18:00:00Z");
  const stopped = await (
    await del(page, "?kind=week", { scope: "onward" })
  ).json();
  expect(stopped).toEqual({ saved: true, budget: null });
  expect(
    await (await del(page, "?kind=week", { scope: "onward" })).json(),
  ).toEqual(stopped);
  expect(
    await Promise.all(
      ["2026-07-15", "2026-07-22", "2026-08-05", "2026-12-01"].map((date) =>
        amountOn(`?kind=week&date=${date}`),
      ),
    ),
  ).toEqual(["700.00", null, null, null]);
  // Days are budgeted independently, so the day budget goes on until stopped.
  expect(await amountOn("?kind=day&date=2026-07-22")).toBe("100.00");
  expect(await stopBudget(page, "?kind=day")).toBeNull();
  expect(await amountOn("?kind=day&date=2026-07-21")).toBe("100.00");
  expect(await amountOn("?kind=day&date=2026-07-22")).toBeNull();

  // A budget that starts in the period stopped from goes entirely.
  await setBudget(page, "?kind=week", "500");
  expect(await stopBudget(page, "?kind=week&date=2026-07-26")).toBeNull();
  expect(await amountOn("?kind=week&date=2026-07-22")).toBeNull();
  expect(await amountOn("?kind=week&date=2026-07-15")).toBe("700.00");
  expect((await listed(page)).repeating).toEqual([]);
  // Stopping when nothing repeats changes nothing.
  expect(await stopBudget(page, "?kind=month")).toBeNull();

  await expectRefusal(
    await request.delete("/api/budgets", {
      headers: { Origin: appOrigin },
      data: { scope: "onward" },
    }),
    "unauthenticated",
    401,
  );
  await expectRefusal(
    await del(page, "?kind=week", { scope: "onward" }, {
      Origin: "https://attacker.example",
    }),
    "request_not_allowed",
    403,
  );
  await expectRefusal(
    await del(page, "?kind=quarter", { scope: "onward" }),
    "invalid_period",
    400,
  );
  for (const [data, field] of [
    [{ scope: "all" }, "scope"],
    [{}, "scope"],
    [{ scope: null }, "scope"],
    ["not a removal", null],
  ] as const) {
    const response = await del(page, "?kind=week", data, {
      Origin: appOrigin,
      "Content-Type": "application/json",
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "invalid_field",
      field,
    });
  }
});

test("the Repeating section changes a repeating budget from its row and stops it once confirmed", async ({
  page,
}, testInfo) => {
  await atMidday(page);
  await setBudget(page, "?kind=week&date=2026-09-09", "2000");
  await setBudget(page, "?kind=week&date=2026-09-21", "2500");
  await page.goto("/budgets");
  const repeating = page.getByRole("region", { name: "Repeating", exact: true });
  const rows = repeating.getByRole("listitem");
  await expect(rows).toHaveText([
    /MXN 2,000\.00 every week\s*From the week of 7 Sep through the week of 14 Sep/,
    /MXN 2,500\.00 every week\s*From the week of 21 Sep/,
  ]);

  // Change opens the form on the row's current week with its amount.
  await rows
    .filter({ hasText: "MXN 2,000.00" })
    .getByRole("button", { name: "Change", exact: true })
    .click();
  const form = page.getByRole("region", { name: "Set budget", exact: true });
  await expect(form.getByText("Week of 7–13 Sep", { exact: true })).toBeVisible();
  const amount = form.getByLabel("Amount (MXN)", { exact: true });
  await expect(amount).toHaveValue("2000.00");
  await amount.fill("2200");
  await form.getByRole("button", { name: "Save budget" }).click();
  await expect(
    notification(page, "Budget of MXN 2,200.00 saved for every week from 7 Sep."),
  ).toBeVisible();
  await expect(rows).toHaveText([
    /MXN 2,200\.00 every week/,
    /MXN 2,500\.00 every week/,
  ]);
  await page.screenshot({
    path: testInfo.outputPath("budgets-repeating.png"),
    fullPage: true,
  });

  // Stop explains that scheduled changes go too, and does nothing until
  // confirmed.
  const stop = rows
    .filter({ hasText: "MXN 2,200.00" })
    .getByRole("button", { name: "Stop", exact: true });
  await stop.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(
    "No week budget repeats from this week on, and every change scheduled after it goes too.",
  );
  await page.screenshot({
    path: testInfo.outputPath("budgets-stop-confirm.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Keep budget" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  await stop.click();
  await dialog.getByRole("button", { name: "Stop budget" }).click();
  await expect(
    notification(page, "Week budget stopped from this week."),
  ).toBeVisible();
  await expect(repeating).toHaveCount(0);
  await expect(page.getByText("No budgets yet", { exact: true })).toBeVisible();
  expect((await summary(page, "?kind=week&date=2026-09-23")).budget).toBeNull();
});

test("a one-off budget replaces the repeating budget for its period only, and can be removed or made the repeating amount", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  const weekOf = async (date: string) => {
    const { budget } = await summary(page, `?kind=week&date=${date}`);
    return budget && [budget.amount, budget.repeats];
  };
  await setBudget(page, "?kind=week&date=2026-09-09", "2000");
  const trip = { amount: "5000", oneOff: true };
  const set = await (await put(page, "?kind=week&date=2026-09-16", trip)).json();
  expect(set).toEqual({
    saved: true,
    budget: {
      kind: "week",
      start: "2026-09-14",
      end: "2026-09-20",
      amount: "5000.00",
      repeats: false,
      expenses: "0.00",
      remaining: "5000.00",
      overBudget: false,
      daysLeft: null,
      leftPerDay: null,
    },
  });
  expect(await (await put(page, "?kind=week&date=2026-09-16", trip)).json()).toEqual(set);
  // The repeating budget resumes the week after.
  expect([
    await weekOf("2026-09-09"),
    await weekOf("2026-09-16"),
    await weekOf("2026-09-23"),
  ]).toEqual([
    ["2000.00", true],
    ["5000.00", false],
    ["2000.00", true],
  ]);

  // Setting it again changes its amount; the current week and a later one can
  // have their own one-off budgets too.
  expect(
    (
      await (
        await put(page, "?kind=week&date=2026-09-14", {
          amount: "4500",
          oneOff: true,
        })
      ).json()
    ).budget,
  ).toMatchObject({ start: "2026-09-14", amount: "4500.00", repeats: false });
  expect(
    (
      await put(page, "?kind=week&date=2026-10-05", {
        amount: "3000",
        oneOff: true,
      })
    ).status(),
  ).toBe(200);
  await record(page, { date: "2026-09-08", amount: "200" });
  expect(
    (await (await put(page, "?kind=week", { amount: "1500", oneOff: true })).json())
      .budget,
  ).toMatchObject({
    start: "2026-09-07",
    amount: "1500.00",
    repeats: false,
    remaining: "1300.00",
    daysLeft: 5,
    leftPerDay: "260.00",
  });
  const list = await listed(page);
  expect(list.now.week).toMatchObject({ amount: "1500.00", repeats: false });
  expect(
    list.upcoming.map((view: { kind: string; start: string; amount: string; repeats: boolean }) => [
      view.kind,
      view.start,
      view.amount,
      view.repeats,
    ]),
  ).toEqual([
    ["week", "2026-09-14", "4500.00", false],
    ["week", "2026-10-05", "3000.00", false],
  ]);
  expect(list.repeating).toEqual([
    { kind: "week", start: "2026-09-07", amount: "2000.00", until: null },
  ]);

  // Removing a one-off budget lets the repeating budget apply again, and
  // removing one that is already gone changes nothing.
  const removed = await (await del(page, "?kind=week", { scope: "period" })).json();
  expect(removed).toMatchObject({
    saved: true,
    budget: { amount: "2000.00", repeats: true, remaining: "1800.00" },
  });
  expect(
    await (await del(page, "?kind=week", { scope: "period" })).json(),
  ).toEqual(removed);

  // Unticking One-off makes its amount the repeating amount from that week
  // onward, leaving other one-off budgets alone.
  expect(
    await setBudget(page, "?kind=week&date=2026-09-16", "4500"),
  ).toMatchObject({ start: "2026-09-14", amount: "4500.00", repeats: true });
  expect([
    await weekOf("2026-09-09"),
    await weekOf("2026-09-23"),
    await weekOf("2026-10-05"),
    await weekOf("2026-10-12"),
  ]).toEqual([
    ["2000.00", true],
    ["4500.00", true],
    ["3000.00", false],
    ["4500.00", true],
  ]);

  // Stopping the repeating budget keeps the one-off budgets planned ahead.
  expect(await stopBudget(page, "?kind=week")).toBeNull();
  expect([await weekOf("2026-09-23"), await weekOf("2026-10-05")]).toEqual([
    null,
    ["3000.00", false],
  ]);
  expect(
    (await listed(page)).upcoming.map((view: { start: string }) => view.start),
  ).toEqual(["2026-10-05"]);

  // An ended week's one-off budget is read-only.
  await expectRefusal(
    await put(page, "?kind=week&date=2026-09-01", trip),
    "period_ended",
    409,
  );
  await expectRefusal(
    await del(page, "?kind=week&date=2026-09-01", { scope: "period" }),
    "period_ended",
    409,
  );
});

test("past budgets list ended periods newest first, day before week before month, twenty at a time", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await atMidday(page);
  // From Monday 1 June: MXN 10 a day, MXN 100 a week, MXN 1,000 a month, and a
  // MXN 150 one-off budget for the week of 8 June.
  await moveClockTo("2026-06-01T18:00:00Z");
  await setBudget(page, "?kind=day", "10");
  await setBudget(page, "?kind=week", "100");
  await setBudget(page, "?kind=month", "1000");
  expect(
    (
      await put(page, "?kind=week&date=2026-06-08", {
        amount: "150",
        oneOff: true,
      })
    ).status(),
  ).toBe(200);
  await record(page, { date: "2026-06-01", amount: "20" });
  await moveClockTo("2026-07-01T18:00:00Z");

  type View = { kind: string; start: string };
  const names = (views: View[]) =>
    views.map((view) => `${view.kind} ${view.start}`);
  const days = (from: number, to: number) =>
    Array.from(
      { length: from - to + 1 },
      (_, index) => `day 2026-06-${String(from - index).padStart(2, "0")}`,
    );
  const first = await listed(page);
  expect(names(first.past)).toEqual([
    "day 2026-06-30",
    "month 2026-06-01",
    "day 2026-06-29",
    "day 2026-06-28",
    "week 2026-06-22",
    ...days(27, 21),
    "week 2026-06-15",
    ...days(20, 14),
  ]);
  // The week of 8 June also ends on the 14th, after that day, so the next page
  // starts with it.
  expect(first.nextBefore).toBe("2026-06-14_day");
  const second = await (
    await page.request.get(`/api/budgets?before=${first.nextBefore}`)
  ).json();
  expect(names(second.past)).toEqual([
    "week 2026-06-08",
    ...days(13, 7),
    "week 2026-06-01",
    ...days(6, 1),
  ]);
  expect(second.nextBefore).toBeNull();

  const find = (views: View[], name: string) =>
    views.find((view) => `${view.kind} ${view.start}` === name);
  expect(find(second.past, "day 2026-06-01")).toEqual({
    kind: "day",
    start: "2026-06-01",
    end: "2026-06-01",
    amount: "10.00",
    repeats: true,
    expenses: "20.00",
    remaining: "-10.00",
    overBudget: true,
    daysLeft: null,
    leftPerDay: null,
  });
  expect(find(second.past, "week 2026-06-01")).toMatchObject({
    amount: "100.00",
    expenses: "20.00",
    remaining: "80.00",
    overBudget: false,
  });
  expect(find(second.past, "week 2026-06-08")).toMatchObject({
    amount: "150.00",
    repeats: false,
    expenses: "0.00",
  });
  expect(find(first.past, "month 2026-06-01")).toEqual(
    (await summary(page, "?kind=month&date=2026-06-10")).budget,
  );

  // Stopping keeps the history.
  expect(await stopBudget(page, "?kind=day")).toBeNull();
  expect(names((await listed(page)).past)).toEqual(names(first.past));
  for (const before of [
    "garbage",
    "2026-02-30_day",
    "2026-06-14_quarter",
    "2026-06-14_day_week",
    "",
  ]) {
    const response = await page.request.get(`/api/budgets?before=${before}`);
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "invalid_field",
      field: "before",
    });
  }
});

test("a one-off budget set from the form is listed under Upcoming one-offs, and Past and the dashboard say how ended periods went", async ({
  page,
}, testInfo) => {
  await atMidday(page);
  // MXN 50 a day from 1 August, a MXN 1,000 one-off budget for the week of 24
  // August, and MXN 2,000 a week from 31 August.
  await moveClockTo("2026-08-01T18:00:00Z");
  await setBudget(page, "?kind=day", "50");
  await moveClockTo("2026-08-24T18:00:00Z");
  expect(
    (await put(page, "?kind=week", { amount: "1000", oneOff: true })).status(),
  ).toBe(200);
  await moveClockTo("2026-08-31T18:00:00Z");
  await setBudget(page, "?kind=week", "2000");
  await moveClockTo(midday);
  await record(page, { date: "2026-08-24", amount: "400" });
  await record(page, { date: "2026-09-01", amount: "2300" });

  await page.goto("/budgets");
  const past = page.getByRole("region", { name: "Past", exact: true });
  const pastRows = past.getByRole("listitem");
  await expect(pastRows).toHaveCount(20);
  await expect(pastRows.first()).toContainText("Tuesday 8 Sep");
  await expect(
    pastRows.filter({ hasText: "Week of 31 Aug – 6 Sep" }),
  ).toContainText("Over by MXN 300.00");
  const tripWeek = pastRows.filter({ hasText: "Week of 24–30 Aug" });
  await expect(tripWeek).toContainText("Under by MXN 600.00");
  await expect(tripWeek).toContainText("One-off");
  // Past is read-only: its only control loads more.
  await expect(past.getByRole("button")).toHaveText(["Show more"]);
  await page.screenshot({
    path: testInfo.outputPath("budgets-past.png"),
    fullPage: true,
  });
  const more = past.getByRole("button", { name: "Show more", exact: true });
  await more.click();
  await expect(pastRows).toHaveCount(40);
  await more.click();
  await expect(pastRows).toHaveCount(41);
  await expect(more).toHaveCount(0);
  await expect(pastRows.last()).toContainText("Saturday 1 Aug");

  // A one-off budget for next week, from the form.
  await page
    .getByRole("button", { name: "Set budget", exact: true })
    .first()
    .click();
  const form = page.getByRole("region", { name: "Set budget", exact: true });
  const oneOff = form.getByRole("checkbox", {
    name: "One-off (this period only)",
  });
  const amount = form.getByLabel("Amount (MXN)", { exact: true });
  await expect(oneOff).not.toBeChecked();
  await form.getByLabel("Date", { exact: true }).fill("2026-09-16");
  await expect(form.getByText("Week of 14–20 Sep", { exact: true })).toBeVisible();
  await expect(amount).toHaveValue("2000.00");
  await oneOff.click();
  await amount.fill("5000");
  await expect(form).toContainText("applies to this period only");
  await page.screenshot({
    path: testInfo.outputPath("budgets-form-one-off.png"),
    fullPage: true,
  });
  await form.getByRole("button", { name: "Save budget" }).click();
  await expect(
    notification(
      page,
      "One-off budget of MXN 5,000.00 saved for the week of 14–20 Sep.",
    ),
  ).toBeVisible();
  const upcoming = page.getByRole("region", {
    name: "Upcoming one-offs",
    exact: true,
  });
  const planned = upcoming.getByRole("listitem");
  await expect(planned).toHaveCount(1);
  await expect(planned).toContainText("Week of 14–20 Sep");
  await expect(planned).toContainText("MXN 5,000.00");
  await page.screenshot({
    path: testInfo.outputPath("budgets-upcoming.png"),
    fullPage: true,
  });

  // Change opens it with One-off ticked; Remove lets the repeating budget back.
  await planned.getByRole("button", { name: "Change", exact: true }).click();
  await expect(form.getByText("Week of 14–20 Sep", { exact: true })).toBeVisible();
  await expect(oneOff).toBeChecked();
  await expect(amount).toHaveValue("5000.00");
  await form.getByRole("button", { name: "Cancel" }).click();
  await planned.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(
    notification(
      page,
      "One-off budget removed. The repeating budget of MXN 2,000.00 applies again.",
    ),
  ).toBeVisible();
  await expect(upcoming).toHaveCount(0);

  // The dashboard card says how an ended week went, and where its budget came
  // from.
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "This week", level: 1 }),
  ).toBeVisible();
  const card = page.getByRole("region", { name: "Budget", exact: true });
  await expect(card).toContainText("Repeating budget.");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aug 31, 2026 – Sep 6, 2026", level: 1 }),
  ).toBeVisible();
  await expect(card).toContainText("This week ended over budget.");
  await expect(card.getByText("Over by MXN 300.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aug 24, 2026 – Aug 30, 2026", level: 1 }),
  ).toBeVisible();
  await expect(card).toContainText(
    "One-off budget. This week ended under budget.",
  );
  await expect(
    card.getByText("Under by MXN 600.00", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("budget-card-ended.png"),
    fullPage: true,
  });
});
