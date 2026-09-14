import { test, expect, type Page } from "@playwright/test";
import {
  connectSheets,
  createdSpreadsheets,
  entryAction,
  expectRefusal,
  forgetSpreadsheets,
  googleAnswers,
  moveClockTo,
  notification,
  resetClock,
  signIn,
  tabRows,
} from "./helpers";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
const entry = {
  kind: "expense",
  amount: "1.00",
  date: "2026-09-08",
  categoryId: null,
  note: "",
};
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async () => {
  await pool.query(
    "TRUNCATE spreadsheet_export, financial_movement, category, category_seed",
  );
  await googleAnswers();
  await forgetSpreadsheets();
});
test.afterAll(async () => {
  await pool.end();
  await googleAnswers();
  await resetClock();
});
// Every export starts from the dashboard the owner sees, on the week of Monday
// 2026-09-07 through Sunday 2026-09-13 in Mexico City.
async function overview(page: Page) {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo("2026-09-11T18:00:00Z");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  return report(page);
}
async function post(page: Page, fields: Record<string, unknown> = {}) {
  const response = await page.request.post("/api/journal", {
    headers: { Origin: origin },
    data: { id: randomUUID(), ...entry, ...fields },
  });
  expect(response.status()).toBe(200);
}
async function report(page: Page, query = "") {
  const response = await page.request.get(`/api/journal${query}`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function exportRequest(
  page: Page,
  { id, kind = "week", date = "2026-09-11" }: Record<string, string>,
) {
  const query = new URLSearchParams({ kind, date });
  return page.request.post(`/api/journal/spreadsheet?${query}`, {
    headers: { Origin: origin },
    data: { id },
  });
}
function category(
  summary: { categories: { id: string; name: string }[] },
  name: string,
) {
  return summary.categories.find((entry) => entry.name === name)!.id;
}
// The spreadsheet's own value for a labelled row of the Summary tab.
function summaryValue(
  rows: Record<string, unknown>[][],
  label: string,
): Record<string, unknown> {
  return rows.find((row) => row[0]?.stringValue === label)![1];
}
async function exportThroughForm(page: Page) {
  await page.getByRole("button", { name: "Export to Google Sheets" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Spreadsheet created" })).toBeVisible();
}

test("the owner authorizes export and the spreadsheet holds the summary's own figures", async ({
  page,
}, testInfo) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  const salary = category(initial, "Salary");
  await post(page, {
    kind: "income",
    amount: "5000",
    categoryId: salary,
    date: "2026-09-07",
    // A note that reads like a formula stays the text the owner typed.
    note: "=SUM(A1:A2)",
  });
  await post(page, {
    amount: "1200.50",
    categoryId: groceries,
    date: "2026-09-08",
    note: "Weekly shop",
  });
  await post(page, {
    kind: "refund",
    amount: "200.25",
    categoryId: groceries,
    date: "2026-09-09",
  });
  await post(page, { amount: "99.99", date: "2026-09-10", note: "Taxi" });
  // An archived category stays on the movements that already carry it, so the
  // snapshot keeps reporting it.
  expect(
    (
      await page.request.post("/api/categories", {
        headers: { Origin: origin },
        data: { action: "archive", id: groceries },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  const summary = await report(page);
  expect(summary.expenses).toBe("1100.24");
  expect(summary.netChange).toBe("3899.76");

  // Export authorization is asked for only when an export needs it, and being
  // signed in is not enough on its own.
  await page.getByRole("button", { name: "Export to Google Sheets" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "We couldn't finish the export" }),
  ).toContainText("isn't connected");
  expect(await createdSpreadsheets()).toHaveLength(0);
  // Refusing so far changed nothing about ordinary use.
  expect((await report(page)).entries).toHaveLength(4);
  await connectSheets(page);
  await expect(page.getByRole("status").filter({ hasText: "Google Sheets is connected" })).toBeVisible();
  await exportThroughForm(page);
  const link = page.getByRole("link", { name: /^Open Finance Buddy:/ });
  await expect(link).toBeVisible();
  const [spreadsheet] = await createdSpreadsheets();
  expect(await link.getAttribute("href")).toBe(
    `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
  );
  await page.screenshot({
    path: testInfo.outputPath("export.png"),
    fullPage: true,
  });

  // The title carries the generation date, which is not the covered period.
  expect(spreadsheet.request.properties.title).toContain("exported 2026-09-11");
  expect(spreadsheet.request.properties.title).toContain("Sep 7, 2026 – Sep 13, 2026");
  const summaryTab = tabRows(spreadsheet, "Summary");
  expect(summaryValue(summaryTab, "Start date")).toEqual({
    stringValue: "2026-09-07",
  });
  expect(summaryValue(summaryTab, "End date")).toEqual({
    stringValue: "2026-09-13",
  });
  expect(summaryValue(summaryTab, "Exported (Mexico City)")).toEqual({
    stringValue: "2026-09-11",
  });
  expect(summaryValue(summaryTab, "Currency")).toEqual({ stringValue: "MXN" });
  expect(summaryValue(summaryTab, "Total income")).toEqual({
    numberValue: Number(summary.income),
  });
  expect(summaryValue(summaryTab, "Total expenses")).toEqual({
    numberValue: 1100.24,
  });
  expect(summaryValue(summaryTab, "Net change")).toEqual({
    numberValue: 3899.76,
  });

  // The category breakdown is the same grouping, including Uncategorized and
  // the refund's reduction of its own group.
  const categories = tabRows(spreadsheet, "Categories");
  expect(categories[0]).toEqual([
    { stringValue: "Category" },
    { stringValue: "Total expenses (MXN)" },
  ]);
  expect(categories.slice(1)).toEqual(
    summary.breakdown.map((group: { category: string; amount: string }) => [
      { stringValue: group.category },
      { numberValue: Number(group.amount) },
    ]),
  );
  expect(categories.slice(1)).toContainEqual([
    { stringValue: "Groceries" },
    { numberValue: 1000.25 },
  ]);
  expect(categories.slice(1)).toContainEqual([
    { stringValue: "Uncategorized" },
    { numberValue: 99.99 },
  ]);

  // Every movement type is a row of its own, with the refund as the reduction
  // the summary shows, and free text kept literal.
  const entries = tabRows(spreadsheet, "Entries");
  expect(entries[0].map((cell) => cell.stringValue)).toEqual([
    "Movement date",
    "Type",
    "Category",
    "Amount (MXN)",
    "Note",
  ]);
  expect(entries.slice(1)).toEqual([
    [
      { stringValue: "2026-09-10" },
      { stringValue: "Expense" },
      { stringValue: "Uncategorized" },
      { numberValue: 99.99 },
      { stringValue: "Taxi" },
    ],
    [
      { stringValue: "2026-09-09" },
      { stringValue: "Refund" },
      { stringValue: "Groceries" },
      { numberValue: -200.25 },
      { stringValue: "" },
    ],
    [
      { stringValue: "2026-09-08" },
      { stringValue: "Expense" },
      { stringValue: "Groceries" },
      { numberValue: 1200.5 },
      { stringValue: "Weekly shop" },
    ],
    [
      { stringValue: "2026-09-07" },
      { stringValue: "Income" },
      { stringValue: "Salary" },
      { numberValue: 5000 },
      { stringValue: "=SUM(A1:A2)" },
    ],
  ]);
  // Nothing is published or shared beyond the owner's own new spreadsheet, and
  // no provider token reaches the browser.
  expect(JSON.stringify(spreadsheet.request)).not.toContain("permission");
  expect(await page.content()).not.toContain("controlled-export-token");
});

test("declining export authorization leaves sign-in and the journal working", async ({
  page,
}) => {
  await overview(page);
  await post(page, { amount: "12.00" });
  await page.reload();
  await page.getByRole("button", { name: "Export to Google Sheets" }).click();
  await connectSheets(page, { deny: true });
  await expect(page.getByText("Google Sheets wasn't connected")).toBeVisible();
  // The session and every operation unrelated to Sheets are untouched.
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  expect((await report(page)).expenses).toBe("12.00");
  await post(page, { amount: "3.00" });
  expect((await report(page)).expenses).toBe("15.00");
  expect(await createdSpreadsheets()).toHaveLength(0);
  // Exporting still offers the connection rather than failing silently.
  await page.getByRole("button", { name: "Export to Google Sheets" }).click();
  await expect(
    page.getByRole("button", { name: "Connect Google Sheets export" }),
  ).toBeVisible();
});

test("each explicit export creates its own spreadsheet and a repeated submission does not", async ({
  page,
}) => {
  await overview(page);
  await post(page, { amount: "40.00" });
  await page.reload();
  await connectExport(page);
  await exportThroughForm(page);
  await post(page, { amount: "60.00" });
  await page.reload();
  await exportThroughForm(page);
  const spreadsheets = await createdSpreadsheets();
  expect(spreadsheets).toHaveLength(2);
  expect(spreadsheets[0].spreadsheetId).not.toBe(spreadsheets[1].spreadsheetId);
  // The first snapshot still reports the period as it stood when exported.
  expect(
    summaryValue(tabRows(spreadsheets[0], "Summary"), "Total expenses"),
  ).toEqual({ numberValue: 40 });
  expect(
    summaryValue(tabRows(spreadsheets[1], "Summary"), "Total expenses"),
  ).toEqual({ numberValue: 100 });

  // The same export submitted again returns the spreadsheet it already
  // finished instead of creating another one.
  const id = randomUUID();
  const first = await exportRequest(page, { id });
  expect(first.status()).toBe(200);
  const repeated = await exportRequest(page, { id });
  expect(repeated.status()).toBe(200);
  // The finished spreadsheet is returned as it was made, title and all.
  expect(await repeated.json()).toEqual(await first.json());
  expect(await createdSpreadsheets()).toHaveLength(3);
  // That identifier belongs to its own period and never silently covers another.
  const moved = await exportRequest(page, { id, kind: "month" });
  await expectRefusal(moved, "export_period_mismatch", 409);
  expect(await moved.json()).toMatchObject({
    error: expect.stringContaining("different period"),
  });
  expect(await createdSpreadsheets()).toHaveLength(3);
});

test("duplicate submission is disabled while an export is pending", async ({
  page,
}) => {
  await overview(page);
  await post(page, { amount: "5.00" });
  await page.reload();
  await connectExport(page);
  await page.route("**/api/journal/spreadsheet*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  const control = page.getByRole("button", { name: "Exporting…" });
  await page.getByRole("button", { name: "Export to Google Sheets" }).click();
  await expect(control).toBeDisabled();
  await control.click({ force: true, timeout: 2000 }).catch(() => {});
  await expect(
    page.getByRole("status").filter({ hasText: "Spreadsheet created" }),
  ).toBeVisible({ timeout: 15000 });
  expect(await createdSpreadsheets()).toHaveLength(1);
});

test("provider failures report actionably, keep the journal intact, and never duplicate a snapshot", async ({
  page,
}) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  await post(page, { amount: "70.00", categoryId: groceries });
  await page.reload();
  await connectExport(page);

  // Exhausted quota: nothing was created, so the same export is retried.
  await googleAnswers("quota");
  const id = randomUUID();
  const refused = await exportRequest(page, { id });
  await expectRefusal(refused, "not_confirmed", 503);
  expect(await refused.json()).toMatchObject({
    error: expect.stringContaining("Try the same export again"),
  });
  expect(await createdSpreadsheets()).toHaveLength(0);
  await googleAnswers();
  const retried = await exportRequest(page, { id });
  expect(retried.status()).toBe(200);
  expect(await createdSpreadsheets()).toHaveLength(1);

  // A provider failure could have created a spreadsheet the app never heard
  // about, so that export is not retried into a second one.
  await googleAnswers("failure");
  const unknown = randomUUID();
  await expectRefusal(
    await exportRequest(page, { id: unknown }),
    "export_unconfirmed",
    409,
  );
  await googleAnswers();
  await expectRefusal(
    await exportRequest(page, { id: unknown }),
    "export_unconfirmed",
    409,
  );
  expect(await createdSpreadsheets()).toHaveLength(1);

  // A revoked permission asks for reconnection and does not revoke app access.
  await googleAnswers("revoked");
  const revoked = await exportRequest(page, { id: randomUUID() });
  await expectRefusal(revoked, "reconnect_required", 403);
  expect(await revoked.json()).toMatchObject({ reconnect: true });
  await page.reload();
  await page.getByRole("button", { name: "Export to Google Sheets" }).click();
  await expect(
    page.getByRole("button", { name: "Connect Google Sheets export" }),
  ).toBeVisible();
  expect((await report(page)).expenses).toBe("70.00");

  // A reply that never arrives is never retried into a second spreadsheet.
  await googleAnswers("silent");
  const lost = randomUUID();
  const silent = await exportRequest(page, { id: lost });
  await expectRefusal(silent, "export_unconfirmed", 409);
  await googleAnswers();
  const repeated = await exportRequest(page, { id: lost });
  await expectRefusal(repeated, "export_unconfirmed", 409);
  expect(await repeated.json()).toMatchObject({
    error: expect.stringContaining("Check Google Drive first"),
  });
  expect(await createdSpreadsheets()).toHaveLength(1);
  // A deliberate new export still works and the records never changed.
  expect((await exportRequest(page, { id: randomUUID() })).status()).toBe(200);
  expect(await createdSpreadsheets()).toHaveLength(2);
  expect((await report(page)).expenses).toBe("70.00");
  expect((await report(page)).categories.length).toBeGreaterThan(0);
});

test("an expired export token is refreshed, and a refused refresh asks for reconnection", async ({
  page,
}) => {
  await overview(page);
  await post(page, { amount: "25.00" });
  await page.reload();
  // The grant Google issues here expires immediately, so the next export can
  // only succeed by refreshing it.
  await googleAnswers("expired");
  await connectExport(page);
  expect((await exportRequest(page, { id: randomUUID() })).status()).toBe(200);
  const [spreadsheet] = await createdSpreadsheets();
  expect(
    summaryValue(tabRows(spreadsheet, "Summary"), "Total expenses"),
  ).toEqual({ numberValue: 25 });

  await googleAnswers("refresh-failed");
  const refused = await exportRequest(page, { id: randomUUID() });
  await expectRefusal(refused, "reconnect_required", 403);
  expect(await refused.json()).toMatchObject({ reconnect: true });
  expect(await createdSpreadsheets()).toHaveLength(1);
  // Ordinary journal use is unaffected by a provider token it does not need.
  expect((await report(page)).expenses).toBe("25.00");
});

test("existing snapshots stay unchanged after corrections, deletion and category management", async ({
  page,
}) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  await post(page, {
    amount: "300.00",
    categoryId: groceries,
    date: "2026-09-08",
    note: "Weekly shop",
  });
  await post(page, { amount: "45.00", date: "2026-09-09" });
  await page.reload();
  await connectExport(page);
  await exportThroughForm(page);
  const [before] = await createdSpreadsheets();
  const original = JSON.stringify(before.request);

  // Real corrections, a real deletion and real category management follow.
  const entries = (await report(page)).entries;
  const kept = entries.find((row: { amount: string }) => row.amount === "300.00");
  const dropped = entries.find(
    (row: { amount: string }) => row.amount === "45.00",
  );
  await page.goto("/");
  await entryAction(page, "Edit", "Expense of MXN 300.00 on 2026-09-08");
  await page.getByLabel("Amount (MXN)").fill("275.00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(notification(page, "Entry updated")).toBeVisible();
  expect(kept.id).toEqual(expect.any(String));
  await entryAction(page, "Delete", "Expense of MXN 45.00 on 2026-09-09");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(notification(page, "Deleted")).toBeVisible();
  expect(dropped.id).toEqual(expect.any(String));
  await page.goto("/categories");
  await page
    .getByRole("button", { name: "Rename Groceries", exact: true })
    .click();
  await page.getByLabel("New name for Groceries").fill("Market");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Category renamed");
  await page.goto("/dashboard");

  // The spreadsheet Google received is the same one; nothing was written back.
  const after = await createdSpreadsheets();
  expect(after).toHaveLength(1);
  expect(JSON.stringify(after[0].request)).toBe(original);
  // A later explicit export is a new artifact carrying the current data.
  await exportThroughForm(page);
  const both = await createdSpreadsheets();
  expect(both).toHaveLength(2);
  expect(JSON.stringify(both[0].request)).toBe(original);
  expect(
    summaryValue(tabRows(both[1], "Summary"), "Total expenses"),
  ).toEqual({ numberValue: 275 });
  expect(tabRows(both[1], "Categories").slice(1)).toEqual([
    [{ stringValue: "Market" }, { numberValue: 275 }],
  ]);
  // Owner-made spreadsheet edits are never read back: the app holds no
  // spreadsheet contents beyond the link it returned.
  const { rows } = await pool.query(
    "SELECT status, spreadsheet_url FROM spreadsheet_export ORDER BY created_at",
  );
  expect(rows.map((row) => row.status)).toEqual(["complete", "complete"]);
  expect(rows[0].spreadsheet_url).toContain(both[0].spreadsheetId);
});

test("an empty period exports a zero-total snapshot, and a long one exports every row", async ({
  page,
}) => {
  await overview(page);
  await connectExport(page);
  expect(
    (await exportRequest(page, { id: randomUUID(), kind: "day" })).status(),
  ).toBe(200);
  const [empty] = await createdSpreadsheets();
  const emptySummary = tabRows(empty, "Summary");
  expect(summaryValue(emptySummary, "Total income")).toEqual({
    numberValue: 0,
  });
  expect(summaryValue(emptySummary, "Total expenses")).toEqual({
    numberValue: 0,
  });
  expect(summaryValue(emptySummary, "Net change")).toEqual({ numberValue: 0 });
  expect(summaryValue(emptySummary, "Entries")).toEqual({ numberValue: 0 });
  // Nothing is invented to fill the gap.
  expect(tabRows(empty, "Entries").slice(1)).toEqual([
    [{ stringValue: "No entries for this period." }],
  ]);
  expect(tabRows(empty, "Categories").slice(1)).toEqual([
    [{ stringValue: "No spending or refunds in this period." }],
  ]);

  // A long period: every day of a past month, all of it in the snapshot.
  for (let day = 1; day <= 30; day++)
    await post(page, {
      amount: "10.00",
      date: `2026-08-${String(day).padStart(2, "0")}`,
    });
  expect(
    (
      await exportRequest(page, {
        id: randomUUID(),
        kind: "month",
        date: "2026-08-15",
      })
    ).status(),
  ).toBe(200);
  const large = (await createdSpreadsheets())[1];
  expect(tabRows(large, "Entries")).toHaveLength(31);
  expect(summaryValue(tabRows(large, "Summary"), "Total expenses")).toEqual({
    numberValue: 300,
  });
});

test("export requires the owner's own session and a same-origin JSON request", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/journal/spreadsheet?kind=week&date=2026-09-11", {
        headers: { Origin: origin },
        data: { id: randomUUID() },
      })
    ).status(),
  ).toBe(401);
  expect(await createdSpreadsheets()).toHaveLength(0);
  await overview(page);
  await connectExport(page);
  const foreign = await page.request.post(
    "/api/journal/spreadsheet?kind=week&date=2026-09-11",
    {
      headers: { Origin: "https://attacker.example" },
      data: { id: randomUUID() },
    },
  );
  await expectRefusal(foreign, "request_not_allowed", 403);
  const form = await page.request.post(
    "/api/journal/spreadsheet?kind=week&date=2026-09-11",
    {
      headers: { Origin: origin, "Content-Type": "text/plain" },
      data: JSON.stringify({ id: randomUUID() }),
    },
  );
  await expectRefusal(form, "request_not_allowed", 403);
  await expectRefusal(
    await exportRequest(page, { id: "not-a-uuid" }),
    "invalid_field",
    400,
  );
  expect(
    (await exportRequest(page, { id: randomUUID(), kind: "fortnight" })).status(),
  ).toBe(400);
  await expectRefusal(
    await exportRequest(page, { id: randomUUID(), date: "2026-13-01" }),
    "invalid_period",
    400,
  );
  expect(
    (
      await exportRequest(page, { id: randomUUID(), date: "2026-02-30" })
    ).status(),
  ).toBe(400);
  expect(await createdSpreadsheets()).toHaveLength(0);
});

// Authorizing export from the dashboard, through the app's own controls.
async function connectExport(page: Page) {
  await page.getByRole("button", { name: "Export to Google Sheets" }).click();
  await connectSheets(page);
  // Next's streamed response can briefly retain a second copy in a hidden
  // fragment. Role locators assert the exposed status, excluding that copy.
  await expect(
    page.getByRole("status").filter({ hasText: "Google Sheets is connected" }),
  ).toBeVisible();
}
