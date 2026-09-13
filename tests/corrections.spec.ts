import { test, expect } from "@playwright/test";
import { choose, entryRow, entryAction, notification, moveClockTo, optionsOf, resetClock, signIn } from "./helpers";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
// Every request body starts from one recorded expense, so each case states only
// the fields it is actually about.
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
// Corrections always start from the overview the owner actually sees, on the
// week of Monday 2026-08-31 through Sunday 2026-09-06 in Mexico City.
async function overview(page: import("@playwright/test").Page) {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo("2026-09-07T05:30:00Z");
  await page.reload();
  return (await page.request.get("/api/journal")).json();
}
async function post(
  page: import("@playwright/test").Page,
  fields: Record<string, unknown> = {},
) {
  const id = randomUUID();
  const response = await page.request.post("/api/journal", {
    headers: { Origin: origin },
    data: { id, ...entry, ...fields },
  });
  expect(response.status()).toBe(200);
  return id;
}
async function edit(
  page: import("@playwright/test").Page,
  fields: Record<string, unknown>,
) {
  return page.request.patch("/api/journal", {
    headers: { Origin: origin },
    data: { ...entry, ...fields },
  });
}
async function remove(
  page: import("@playwright/test").Page,
  data: Record<string, unknown>,
) {
  return page.request.delete("/api/journal", {
    headers: { Origin: origin },
    data,
  });
}
async function report(page: import("@playwright/test").Page, query = "") {
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

test("an entry is corrected through the form and both periods it touches agree", async ({
  page,
  browser,
}, testInfo) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  const id = await post(page, {
    amount: "1200",
    date: "2026-09-01",
    categoryId: groceries,
    note: "Weekly shop",
  });
  await page.reload();
  await entryAction(page, "Edit", "Expense of MXN 1,200.00 on 2026-09-01");
  await expect(
    page.getByRole("heading", { name: "Edit entry", level: 2 }),
  ).toBeVisible();
  // The form opens on the recorded values, not on empty fields.
  await expect(page.getByLabel("Type", { exact: true })).toHaveText("Expense");
  await expect(page.getByLabel("Amount (MXN)")).toHaveValue("1200.00");
  await expect(page.getByLabel("Movement date", { exact: true })).toHaveValue(
    "2026-09-01",
  );
  await expect(page.getByLabel("Category (optional)")).toHaveText("Groceries");
  await expect(page.getByLabel("Note (optional)")).toHaveValue("Weekly shop");
  await page.screenshot({
    path: testInfo.outputPath("edit-entry.png"),
    fullPage: true,
  });
  // The creation rules apply unchanged, and a refused correction keeps the
  // values on screen without claiming success.
  await page.getByLabel("Amount (MXN)").fill("12.345");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(notification(page, "two decimal places")).toBeVisible();
  await expect(page.getByLabel("Note (optional)")).toHaveValue("Weekly shop");
  expect((await report(page)).expenses).toBe("1200.00");
  await page.getByLabel("Amount (MXN)").fill("999.99");
  await page.getByLabel("Movement date", { exact: true }).fill("2026-09-07");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(notification(page, "today or earlier")).toBeVisible();
  // A valid correction moves the entry, its totals and its breakdown at once.
  await page.getByLabel("Movement date", { exact: true }).fill("2026-09-02");
  await choose(page, "Category (optional)", "Dining");
  await page.getByLabel("Note (optional)").fill("Dinner out");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(notification(page, "Entry updated.")).toBeVisible();
  await expect(
    entryRow(page, "Expense", "Dining"),
  ).toBeVisible();
  await expect(
    page.getByText("MXN 999.99", { exact: true }).first(),
  ).toBeVisible();
  const week = await report(page);
  expect([week.income, week.expenses, week.netChange]).toEqual([
    "0.00",
    "999.99",
    "-999.99",
  ]);
  expect(week.entries).toEqual([
    {
      id,
      kind: "expense",
      amount: "999.99",
      currency: "MXN",
      date: "2026-09-02",
      categoryId: category(initial, "Dining"),
      category: "Dining",
      note: "Dinner out",
    },
  ]);
  expect(week.breakdown).toEqual([
    {
      categoryId: category(initial, "Dining"),
      category: "Dining",
      amount: "999.99",
    },
  ]);
  // The day it left holds nothing; the day it entered holds all of it.
  expect(
    (await report(page, "?kind=day&date=2026-09-01")).entries,
  ).toHaveLength(0);
  expect((await report(page, "?kind=day&date=2026-09-02")).expenses).toBe(
    "999.99",
  );
  // The correction survives a refresh and is the same in another session.
  await page.reload();
  await expect(
    entryRow(page, "Expense", "Dining"),
  ).toBeVisible();
  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await overview(secondPage);
  expect(await report(secondPage)).toEqual(await report(page));
  await second.close();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a correction keeps an archived category and refuses an incompatible one", async ({
  page,
}) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  const salary = category(initial, "Salary");
  const dining = category(initial, "Dining");
  const id = await post(page, { amount: "500", categoryId: groceries });
  await pool.query("UPDATE category SET active=false WHERE id=$1", [groceries]);
  // Another field changes while the archived category stays exactly as recorded.
  expect(
    (
      await edit(page, {
        id,
        amount: "450",
        categoryId: groceries,
        note: "Corrected",
      })
    ).status(),
  ).toBe(200);
  const kept = await report(page);
  expect(kept.entries[0].categoryId).toBe(groceries);
  expect(kept.entries[0].category).toBe("Groceries");
  expect(kept.expenses).toBe("450.00");
  expect(kept.categories.map((one: { id: string }) => one.id)).not.toContain(
    groceries,
  );
  // The archived category is offered to this entry only, labelled as archived.
  await page.reload();
  await entryAction(page, "Edit", "Expense of MXN 450.00 on 2026-09-06");
  await expect(page.getByLabel("Category (optional)")).toHaveText(
    "Groceries (archived)",
  );
  expect(
    await optionsOf(page, "Category (optional)"),
  ).toEqual([
    "Uncategorized",
    "Groceries (archived)",
    "Dining",
    "Entertainment",
    "Health",
    "Housing",
    "Shopping",
    "Transport",
    "Utilities",
  ]);
  // Replacing it permits an active compatible category or none at all.
  await choose(page, "Category (optional)", "Health");
  // Leaving the expense list clears the category; coming back offers it again.
  await choose(page, "Type", "Income");
  await expect(page.getByLabel("Category (optional)")).toHaveText("Uncategorized");
  await choose(page, "Type", "Expense");
  await expect(page.getByLabel("Category (optional)")).toHaveText(
    "Groceries (archived)",
  );
  await choose(page, "Category (optional)", "Health");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(notification(page, "Entry updated.")).toBeVisible();
  expect((await report(page)).entries[0].category).toBe("Health");
  // Once replaced, the archived category cannot be chosen again.
  const refused = await edit(page, {
    id,
    amount: "450",
    categoryId: groceries,
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).field).toBe("categoryId");
  expect((await report(page)).entries[0].category).toBe("Health");
  // An income category never classifies an expense or a refund, and a foreign
  // or unknown category is refused the same way.
  for (const fields of [
    { kind: "expense", categoryId: salary },
    { kind: "refund", categoryId: salary },
    { kind: "income", categoryId: dining },
    { kind: "expense", categoryId: randomUUID() },
  ])
    expect((await edit(page, { id, amount: "450", ...fields })).status()).toBe(
      400,
    );
  expect((await report(page)).entries[0].kind).toBe("expense");
  // Changing type to one that reads the same list keeps the category; the other
  // list's categories are cleared by the form rather than carried over.
  expect(
    (
      await edit(page, {
        id,
        amount: "450",
        kind: "refund",
        categoryId: dining,
      })
    ).status(),
  ).toBe(200);
  expect((await report(page)).expenses).toBe("-450.00");
  await page.reload();
  await entryAction(page, "Edit", "Refund of MXN 450.00 on 2026-09-06");
  await choose(page, "Type", "Income");
  await expect(page.getByLabel("Category (optional)")).toHaveText("Uncategorized");
  expect(
    await optionsOf(page, "Category (optional)"),
  ).toEqual(["Uncategorized", "Freelance", "Other income", "Salary"]);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(notification(page, "Entry updated.")).toBeVisible();
  const asIncome = await report(page);
  expect([asIncome.income, asIncome.expenses, asIncome.netChange]).toEqual([
    "450.00",
    "0.00",
    "450.00",
  ]);
  expect(asIncome.entries[0].category).toBe("Uncategorized");
  expect(asIncome.breakdown).toEqual([]);
});

test("deletion is confirmed, permanent, and reflected in every period", async ({
  page,
}, testInfo) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  await post(page, {
    amount: "300",
    date: "2026-09-02",
    categoryId: groceries,
  });
  const refundId = await post(page, {
    kind: "refund",
    amount: "50",
    date: "2026-09-06",
    categoryId: groceries,
  });
  await page.reload();
  // The confirmation names the type, the amount and the movement date.
  await entryAction(page, "Delete", "Refund of MXN 50.00 on 2026-09-06");
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("heading", { name: "Delete this entry permanently?" }),
  ).toBeVisible();
  await expect(dialog).toContainText("Refund of MXN 50.00 on 2026-09-06");
  await expect(dialog).toContainText("Groceries");
  await page.screenshot({
    path: testInfo.outputPath("delete-confirmation.png"),
    fullPage: true,
  });
  // Cancelling changes nothing at all.
  await dialog.getByRole("button", { name: "Keep entry" }).click();
  await expect(dialog).toBeHidden();
  expect((await report(page)).entries).toHaveLength(2);
  expect((await report(page)).expenses).toBe("250.00");
  await entryAction(page, "Delete", "Refund of MXN 50.00 on 2026-09-06");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(notification(page, "Deleted Refund of MXN 50.00 on 2026-09-06.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entries" })).toBeFocused();
  const afterRefund = await report(page);
  expect(afterRefund.entries).toHaveLength(1);
  expect(afterRefund.expenses).toBe("300.00");
  expect(afterRefund.breakdown).toEqual([
    { categoryId: groceries, category: "Groceries", amount: "300.00" },
  ]);
  // Deleting again cannot bring it back, and the journal is unchanged.
  expect((await remove(page, { id: refundId })).status()).toBe(400);
  expect((await report(page)).entries).toHaveLength(1);
  // The expense leaves the day, the week and the month together.
  await entryAction(page, "Delete", "Expense of MXN 300.00 on 2026-09-02");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(
    page.getByText("No entries in this period", { exact: true }),
  ).toBeVisible();
  for (const query of [
    "?kind=day&date=2026-09-02",
    "",
    "?kind=month&date=2026-09-06",
  ]) {
    const empty = await report(page, query);
    expect([empty.income, empty.expenses, empty.netChange]).toEqual([
      "0.00",
      "0.00",
      "0.00",
    ]);
    expect(empty.entries).toHaveLength(0);
    expect(empty.breakdown).toHaveLength(0);
  }
  // Deletion removes movements only: the category records stay intact.
  expect((await report(page)).categories).toHaveLength(11);
  // A failed deletion says so and keeps the entry and the confirmation open.
  await post(page, { amount: "7" });
  await page.reload();
  await entryAction(page, "Delete", "Expense of MXN 7.00 on 2026-09-06");
  await page.route("**/api/journal", async (route) =>
    route.request().method() === "DELETE" ? route.abort() : route.continue(),
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(
    notification(page, "The deletion could not be confirmed"),
  ).toBeVisible();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.unroute("**/api/journal");
  expect((await report(page)).entries).toHaveLength(1);
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(notification(page, "Deleted Expense")).toBeVisible();
  expect((await report(page)).entries).toHaveLength(0);
});

test("a purchase and a refund in different months are each corrected accurately", async ({
  page,
}) => {
  const initial = await overview(page);
  const groceries = category(initial, "Groceries");
  const august = "?kind=month&date=2026-08-15";
  const september = "?kind=month&date=2026-09-06";
  const purchase = await post(page, {
    amount: "1200",
    date: "2026-08-15",
    categoryId: groceries,
    note: "Card purchase",
  });
  await post(page, {
    kind: "refund",
    amount: "200",
    date: "2026-09-05",
    categoryId: groceries,
  });
  expect((await report(page, august)).expenses).toBe("1200.00");
  expect((await report(page, september)).expenses).toBe("-200.00");
  expect((await report(page, september)).netChange).toBe("200.00");
  // Correct the purchase in its own month, through the app.
  await page.getByLabel("Jump to date").fill("2026-08-15");
  await choose(page, "Period", "Month");
  await expect(
    page.getByRole("heading", { name: "August 2026", level: 1 }),
  ).toBeVisible();
  await entryAction(page, "Edit", "Expense of MXN 1,200.00 on 2026-08-15");
  await page.getByLabel("Amount (MXN)").fill("1000");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(notification(page, "Entry updated.")).toBeVisible();
  expect((await report(page, august)).expenses).toBe("1000.00");
  // Correct the refund, moving it into the purchase's month.
  await page.getByLabel("Jump to date").fill("2026-09-05");
  // September holds today, so the month the owner returns to reads as current.
  await expect(
    page.getByRole("heading", { name: "This month", level: 1 }),
  ).toBeVisible();
  await entryAction(page, "Edit", "Refund of MXN 200.00 on 2026-09-05");
  await page.getByLabel("Amount (MXN)").fill("250");
  await page.getByLabel("Movement date", { exact: true }).fill("2026-08-20");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(notification(page, "outside the period you are viewing")).toBeVisible();
  // The month it left reports no activity; the month it entered nets both.
  const left = await report(page, september);
  expect([left.income, left.expenses, left.netChange]).toEqual([
    "0.00",
    "0.00",
    "0.00",
  ]);
  expect(left.entries).toHaveLength(0);
  const joined = await report(page, august);
  expect([joined.income, joined.expenses, joined.netChange]).toEqual([
    "0.00",
    "750.00",
    "-750.00",
  ]);
  expect(joined.breakdown).toEqual([
    { categoryId: groceries, category: "Groceries", amount: "750.00" },
  ]);
  // A correction cannot move an entry into the future.
  expect(
    (
      await edit(page, { id: purchase, amount: "1000", date: "2026-09-15" })
    ).status(),
  ).toBe(400);
  // A refund never becomes income, so a refund-only month stays negative.
  expect((await remove(page, { id: purchase })).status()).toBe(200);
  const refundOnly = await report(page, august);
  expect([
    refundOnly.income,
    refundOnly.expenses,
    refundOnly.netChange,
  ]).toEqual(["0.00", "-250.00", "250.00"]);
});

test("corrections and deletions reach only the signed-in owner's entries", async ({
  page,
  request,
}) => {
  const initial = await overview(page);
  const mine = await post(page, { amount: "80", note: "Mine" });
  const foreignOwner = randomUUID(),
    foreignEntry = randomUUID();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,$2,$3,true,now(),now())',
    [foreignOwner, "Foreign", `${foreignOwner}@example.test`],
  );
  await pool.query(
    "INSERT INTO financial_movement(id,owner_id,kind,amount_centavos,movement_date,note) VALUES ($1,$2,'expense',99900,'2026-09-06','Private note')",
    [foreignEntry, foreignOwner],
  );
  for (const id of [foreignEntry, randomUUID()]) {
    const refused = await edit(page, { id, amount: "1", note: "Stolen" });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).field).toBe("id");
    expect((await remove(page, { id })).status()).toBe(400);
  }
  expect(
    (
      await pool.query(
        "SELECT amount_centavos::text AS centavos, note FROM financial_movement WHERE id=$1",
        [foreignEntry],
      )
    ).rows,
  ).toEqual([{ centavos: "99900", note: "Private note" }]);
  // Invalid payloads change nothing and never say which entries exist.
  for (const data of [
    {},
    { id: "not-a-uuid" },
    { id: mine, amount: "0" },
    { id: mine, kind: "transfer", amount: "1" },
    { id: mine, amount: "1", date: "2026-09-07" },
    { id: mine, amount: "1", note: "x".repeat(2001) },
    { id: mine, amount: "1", categoryId: "not-a-uuid" },
    { id: mine, amount: "1", categoryId: category(initial, "Salary") },
  ])
    expect((await edit(page, data)).status()).toBe(400);
  for (const data of [{}, { id: 42 }, { id: null }])
    expect((await remove(page, data)).status()).toBe(400);
  expect(await report(page)).toEqual({
    ...initial,
    entries: [
      {
        id: mine,
        kind: "expense",
        amount: "80.00",
        currency: "MXN",
        date: "2026-09-06",
        categoryId: null,
        category: "Uncategorized",
        note: "Mine",
      },
    ],
    expenses: "80.00",
    netChange: "-80.00",
    breakdown: [
      { categoryId: null, category: "Uncategorized", amount: "80.00" },
    ],
  });
  // Both corrections require a live owner session and a same-origin JSON request.
  expect(
    (await request.patch("/api/journal", { data: { id: mine } })).status(),
  ).toBe(401);
  expect(
    (await request.delete("/api/journal", { data: { id: mine } })).status(),
  ).toBe(401);
  for (const method of ["patch", "delete"] as const) {
    expect(
      (
        await page.request[method]("/api/journal", {
          headers: { Origin: "https://foreign.test" },
          data: { id: mine },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request[method]("/api/journal", {
          headers: { "Content-Type": "text/plain", Origin: origin },
          data: "id",
        })
      ).status(),
    ).toBe(403);
  }
  expect((await report(page)).entries).toHaveLength(1);
});

test("an unconfirmed correction keeps the form and is retried safely", async ({
  page,
}) => {
  await overview(page);
  const id = await post(page, { amount: "40", note: "Taxi" });
  await page.reload();
  await entryAction(page, "Edit", "Expense of MXN 40.00 on 2026-09-06");
  await page.getByLabel("Amount (MXN)").fill("45.50");
  await page.getByLabel("Note (optional)").fill("Taxi home");
  let lost = false;
  await page.route("**/api/journal", async (route) => {
    if (route.request().method() !== "PATCH" || lost) return route.continue();
    lost = true;
    await route.fetch(); // The database commits; only the response is lost.
    await route.abort();
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  // No success is claimed, the values stay on screen, and the form stays open.
  await expect(notification(page, "Retry this same entry safely")).toBeVisible();
  await expect(notification(page, "Entry updated")).toHaveCount(0);
  await expect(page.getByLabel("Amount (MXN)")).toHaveValue("45.50");
  await expect(page.getByLabel("Amount (MXN)")).toBeDisabled();
  // Retrying writes the same values again rather than adding an entry.
  await page.getByRole("button", { name: "Retry same entry" }).click();
  await expect(notification(page, "Entry updated.")).toBeVisible();
  const corrected = await report(page);
  expect(corrected.entries).toEqual([
    {
      id,
      kind: "expense",
      amount: "45.50",
      currency: "MXN",
      date: "2026-09-06",
      categoryId: null,
      category: "Uncategorized",
      note: "Taxi home",
    },
  ]);
  expect(corrected.expenses).toBe("45.50");
});
