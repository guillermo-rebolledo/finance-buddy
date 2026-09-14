import { test, expect, type Page } from "@playwright/test";
import { choose, expectRefusal, moveClockTo, pdfText, resetClock, signIn } from "./helpers";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
// Every recording starts from one expense inside the exported week, so each case
// states only the fields it is actually about.
const entry = {
  kind: "expense",
  amount: "1.00",
  date: "2026-09-06",
  categoryId: null,
  note: "",
};
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async () => {
  await pool.query("TRUNCATE financial_movement, category, category_seed");
});
test.afterAll(async () => {
  await pool.end();
  await resetClock();
});
// Exports always start from the dashboard the owner actually sees, on the week
// of Monday 2026-08-31 through Sunday 2026-09-06 in Mexico City.
async function overview(page: Page) {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo("2026-09-07T05:30:00Z");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  return (await page.request.get("/api/journal")).json();
}
async function post(page: Page, fields: Record<string, unknown> = {}) {
  const id = randomUUID();
  const response = await page.request.post("/api/journal", {
    headers: { Origin: origin },
    data: { id, ...entry, ...fields },
  });
  expect(response.status()).toBe(200);
  return id;
}
async function report(page: Page, query = "") {
  const response = await page.request.get(`/api/journal${query}`);
  expect(response.status()).toBe(200);
  return response.json();
}
function category(
  summary: { categories: { id: string; name: string }[] },
  name: string,
) {
  return summary.categories.find((entry) => entry.name === name)!.id;
}
// The export as the owner performs it: the control on screen, the file the
// browser receives, and the text that file actually draws.
async function download(page: Page) {
  const started = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const file = await started;
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  return { file, name: file.suggestedFilename(), bytes, text: pdfText(bytes) };
}

test("the period on screen is exported with its totals, breakdown and every movement", async ({
  page,
}, testInfo) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  const salary = category(initial, "Salary");
  await post(page, { amount: "12000", categoryId: salary, kind: "income" });
  await post(page, {
    amount: "1250.55",
    date: "2026-09-01",
    categoryId: groceries,
    note: "Weekly shop at the market, including a long note that has to wrap inside its own column of the report.",
  });
  await post(page, { amount: "300", date: "2026-08-31" });
  await post(page, {
    kind: "refund",
    amount: "50.55",
    date: "2026-09-05",
    categoryId: groceries,
  });
  await page.reload();
  const snapshot = await download(page);
  // The export date names the file; the period it covers is named inside it.
  await snapshot.file.saveAs(testInfo.outputPath(snapshot.name));
  expect(snapshot.name).toBe(
    "finance-buddy-week-2026-08-31-to-2026-09-06-exported-2026-09-06.pdf",
  );
  expect(snapshot.text).toContain("Exported on 2026-09-06 (Mexico City time)");
  expect(snapshot.text).toContain(
    "Period covered: Aug 31, 2026 – Sep 6, 2026 (2026-08-31 to 2026-09-06)",
  );
  expect(snapshot.text).toContain("Mexican pesos (MXN)");
  // The figures reconcile with the summary the overview is showing.
  const summary = await report(page);
  expect([summary.income, summary.expenses, summary.netChange]).toEqual([
    "12000.00",
    "1500.00",
    "10500.00",
  ]);
  expect(snapshot.text).toContain("Total income MXN 12,000.00");
  expect(snapshot.text).toContain(
    "Total expenses (after refunds) MXN 1,500.00",
  );
  expect(snapshot.text).toContain("Net change +MXN 10,500.00");
  expect(snapshot.text).toContain("Groceries MXN 1,200.00");
  expect(snapshot.text).toContain("Uncategorized MXN 300.00");
  expect(snapshot.text).toContain("Financial movements (4)");
  expect(snapshot.text).toContain("Date Type Amount Category Note");
  for (const movement of [
    "2026-09-06 Income MXN 12,000.00 Salary",
    "2026-09-05 Refund -MXN 50.55 Groceries",
    "2026-09-01 Expense MXN 1,250.55 Groceries",
    "2026-08-31 Expense MXN 300.00 Uncategorized",
  ])
    expect(snapshot.text).toContain(movement);
  expect(snapshot.text).toContain(
    "Weekly shop at the market, including a long note that has to wrap inside its own column of the report.",
  );
  expect(snapshot.text).toContain("Page 1 of 1");
  // The download reports itself on screen, at either viewport.
  await expect(page.getByRole("status")).toContainText(
    `Downloaded ${snapshot.name}`,
  );
  await page.screenshot({
    path: testInfo.outputPath("export-control.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a browsed period exports itself rather than the current one", async ({
  page,
}) => {
  await overview(page);
  await post(page, { amount: "700", date: "2026-07-15" });
  await post(page, { amount: "99", date: "2026-09-06" });
  await page.reload();
  await choose(page, "Period", "Month");
  await page.getByLabel("Jump to date").fill("2026-07-15");
  await expect(page.getByRole("heading", { name: "July 2026" })).toBeVisible();
  const snapshot = await download(page);
  expect(snapshot.name).toBe(
    "finance-buddy-month-2026-07-01-to-2026-07-31-exported-2026-09-06.pdf",
  );
  expect(snapshot.text).toContain("Period covered: July 2026");
  expect(snapshot.text).toContain("Total expenses (after refunds) MXN 700.00");
  expect(snapshot.text).toContain("Financial movements (1)");
  expect(snapshot.text).not.toContain("MXN 99.00");
});

test("an empty period exports zero totals and invents no rows", async ({
  page,
}) => {
  await overview(page);
  const snapshot = await download(page);
  expect(snapshot.text).toContain("Total income MXN 0.00");
  expect(snapshot.text).toContain("Total expenses (after refunds) MXN 0.00");
  expect(snapshot.text).toContain("Net change MXN 0.00");
  expect(snapshot.text).toContain("No expenses or refunds in this period.");
  expect(snapshot.text).toContain("Financial movements (0)");
  expect(snapshot.text).toContain("No financial movements in this period.");
});

test("refunds, uncategorized groups and archived categories survive into the snapshot", async ({
  page,
}) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  await post(page, { kind: "refund", amount: "250", categoryId: groceries });
  await post(page, { kind: "refund", amount: "40" });
  await pool.query("UPDATE category SET active=false WHERE id=$1", [groceries]);
  await page.reload();
  const snapshot = await download(page);
  // A refunded period is negative, and nothing is clamped on its way into the file.
  expect(snapshot.text).toContain("Total expenses (after refunds) -MXN 290.00");
  expect(snapshot.text).toContain("Net change +MXN 290.00");
  expect(snapshot.text).toContain("Groceries -MXN 250.00");
  expect(snapshot.text).toContain("Uncategorized -MXN 40.00");
  expect(snapshot.text).toContain("Refund -MXN 250.00 Groceries");
  expect(snapshot.text).toContain("Refund -MXN 40.00 Uncategorized");
});

test("a large period spans pages and truncates no record", async ({
  page,
}, testInfo) => {
  const summary = await overview(page);
  const owner = (await (await page.request.get("/api/private")).json()).userId;
  const groceries = category(summary, "Groceries");
  for (let index = 0; index < 120; index++)
    await pool.query(
      "INSERT INTO financial_movement(id,owner_id,kind,amount_centavos,movement_date,category_id,note) VALUES ($1,$2,'expense',$3,'2026-09-03',$4,$5)",
      [
        randomUUID(),
        owner,
        String(100 + index),
        groceries,
        `Movement number ${index}`,
      ],
    );
  await choose(page, "Period", "Month");
  await expect(page.getByRole("heading", { name: "This month" })).toBeVisible();
  const snapshot = await download(page);
  // Kept as a test artifact so the multi-page layout can be looked at.
  await snapshot.file.saveAs(testInfo.outputPath(snapshot.name));
  expect(snapshot.text).toContain("Financial movements (120)");
  const pages = /Page 1 of (\d+)/.exec(snapshot.text)![1];
  expect(Number(pages)).toBeGreaterThan(1);
  expect(snapshot.text).toContain(`Page ${pages} of ${pages}`);
  for (const index of [0, 1, 59, 118, 119])
    expect(snapshot.text).toContain(`Movement number ${index}`);
  // Every amount recorded is present exactly once, in the file and on screen.
  expect(
    (await report(page, "?kind=month&date=2026-09-06")).entries,
  ).toHaveLength(120);
  expect(snapshot.text.match(/MXN 1\.19\b/g)).toHaveLength(1);
});

test("a note longer than a page carries on across pages", async ({
  page,
}, testInfo) => {
  await overview(page);
  // The longest note the journal accepts, wrapped into the narrowest column.
  const note =
    `START ${"describing this purchase at length ".repeat(55)} END`.slice(
      0,
      2000,
    );
  await post(page, { amount: "60", note });
  await page.reload();
  const snapshot = await download(page);
  await snapshot.file.saveAs(testInfo.outputPath(snapshot.name));
  expect(Number(/Page 1 of (\d+)/.exec(snapshot.text)![1])).toBeGreaterThan(1);
  // Both ends of the note are in the file, and its row keeps its headings.
  expect(snapshot.text).toContain("START describing this purchase");
  expect(snapshot.text.trimEnd()).toContain("END");
  expect(snapshot.text.match(/Date Type Amount Category Note/g)!.length).toBe(
    Number(/Page 1 of (\d+)/.exec(snapshot.text)![1]),
  );
  // Read without the page furniture, the note is whole and in order.
  const written = snapshot.text
    .replace(/Page \d+ of \d+ /g, "")
    .replace(/Date Type Amount Category Note /g, "");
  expect(
    written.slice(written.indexOf("START"), written.lastIndexOf("END") + 3),
  ).toBe(note.replace(/\s+/g, " ").trim());
});

test("long tokens and nonstandard characters do not prevent an export", async ({ page }) => {
  await overview(page);
  const token = "W".repeat(1500);
  await post(page, { note: `START ${token} café € 🧾 END` });
  await page.reload();
  const snapshot = await download(page);
  const note = snapshot.text
    .replace(/Page \d+ of \d+/g, "")
    .replace(/Date Type Amount Category Note/g, "");
  expect(note.replace(/\s+/g, "")).toContain(`START${token}café€?END`);
  expect(snapshot.text).toContain("2026-09-06 Expense MXN 1.00 Uncategorized");
});

test("an existing snapshot is untouched by later corrections, deletions and renames", async ({
  page,
}) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  const kept = await post(page, { amount: "500", categoryId: groceries });
  const doomed = await post(page, { amount: "125", note: "Will be deleted" });
  await page.reload();
  const before = await download(page);
  await page.request.patch("/api/journal", {
    headers: { Origin: origin },
    data: {
      ...entry,
      id: kept,
      amount: "480",
      categoryId: groceries,
      note: "Corrected",
    },
  });
  await page.request.delete("/api/journal", {
    headers: { Origin: origin },
    data: { id: doomed },
  });
  await page.request.post("/api/categories", {
    headers: { Origin: origin },
    data: { action: "rename", id: groceries, name: "Food and home" },
  });
  await page.request.post("/api/categories", {
    headers: { Origin: origin },
    data: { action: "archive", id: groceries },
  });
  // The file already downloaded still reads exactly as it did.
  const again = pdfText(before.bytes);
  expect(again).toBe(before.text);
  expect(again).toContain("Total expenses (after refunds) MXN 625.00");
  expect(again).toContain("Groceries MXN 500.00");
  expect(again).toContain("Expense MXN 125.00 Uncategorized");
  expect(again).not.toContain("Food and home");
  // A new export reflects the current records and labels.
  await page.reload();
  const after = await download(page);
  expect(after.name).toBe(before.name);
  expect(after.text).toContain("Food and home MXN 480.00");
  expect(after.text).toContain("Financial movements (1)");
  expect(after.text).not.toContain("Will be deleted");
});

test("exports require a session and include only the signed-in user's journal", async ({
  page,
  browser,
  request,
}) => {
  await overview(page);
  await post(page, { amount: "777", note: "Private note" });
  const anonymous = await request.get(`${origin}/api/journal/export`);
  await expectRefusal(anonymous, "unauthenticated", 401);
  expect(anonymous.headers()["content-type"]).toContain("application/json");
  expect(await anonymous.text()).not.toContain("Private note");
  // A second signed-in user can export only their own journal.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await signIn(stranger, "stranger");
  await expect(stranger.getByRole("heading", { name: "This week" })).toBeVisible();
  const exported = await stranger.request.get("/api/journal/export");
  expect(exported.status()).toBe(200);
  expect(await pdfText(await exported.body())).not.toContain("Private note");
  await other.close();
  // An unresolvable period is refused before anything is read.
  const invalid = await page.request.get("/api/journal/export?kind=quarter");
  await expectRefusal(invalid, "invalid_period", 400);
  expect((await invalid.json()).error).toContain("day, week, or month");
});

test("a failed export reports an actionable retry and changes nothing", async ({
  page,
}) => {
  await overview(page);
  await post(page, { amount: "42" });
  await page.reload();
  await page.route("**/api/journal/export**", (route) => route.abort());
  await page.getByRole("button", { name: "Export PDF" }).click();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Export needs attention" });
  await expect(alert).toContainText(
    "The PDF could not be created, and your journal is unchanged. Retry the export.",
  );
  expect((await report(page)).entries).toHaveLength(1);
  // A refusal reports what the server said rather than a failed rendering.
  await page.unroute("**/api/journal/export**");
  await page.route("**/api/journal/export**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Workspace access required." }),
    }),
  );
  await page.getByRole("button", { name: "Retry export" }).click();
  await expect(alert).toContainText("Workspace access required.");
  await page.unroute("**/api/journal/export**");
  const started = page.waitForEvent("download");
  await page.getByRole("button", { name: "Retry export" }).click();
  const file = await started;
  expect(file.suggestedFilename()).toContain("exported-2026-09-06.pdf");
  await expect(alert).toBeHidden();
});
