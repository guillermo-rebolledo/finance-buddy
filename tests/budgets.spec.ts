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
