import { test, expect } from "@playwright/test";
import {
  choose,
  goToSection,
  moveClockTo,
  optionsOf,
  resetClock,
  signIn,
} from "./helpers";
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
// The Categories page is always reached the way the owner reaches it, from the
// overview, so the navigation stays part of every scenario.
async function manage(page: import("@playwright/test").Page) {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await moveClockTo("2026-09-07T05:30:00Z");
  await page.reload();
  await goToSection(page, "Categories");
  await expect(
    page.getByRole("heading", { name: "Categories", level: 1 }),
  ).toBeVisible();
}
async function change(
  page: import("@playwright/test").Page,
  data: Record<string, unknown>,
) {
  return page.request.post("/api/categories", {
    headers: { Origin: origin },
    data,
  });
}
async function lists(page: import("@playwright/test").Page) {
  const response = await page.request.get("/api/categories");
  expect(response.status()).toBe(200);
  return response.json();
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

test("custom categories are created per list and become available to matching entries", async ({
  page,
}, testInfo) => {
  await manage(page);
  await page.getByLabel("New income category").fill("  Dividends  ");
  await page.getByRole("button", { name: "Add income category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category added.");
  await page.getByLabel("New expense category").fill("Pets");
  await page.getByRole("button", { name: "Add expense category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category added.");
  const after = await lists(page);
  // Surrounding whitespace is trimmed before the name is stored.
  expect(after.income.map((c: { name: string }) => c.name)).toContain(
    "Dividends",
  );
  expect(after.expense.map((c: { name: string }) => c.name)).toContain("Pets");
  expect(after.income.map((c: { name: string }) => c.name)).not.toContain(
    "Pets",
  );
  await expect(page.getByLabel("New income category")).toHaveValue("");
  await page.screenshot({
    path: testInfo.outputPath("categories.png"),
    fullPage: true,
  });
  // A newly created category is offered to compatible entries on the next load
  // of the form, with no other refresh needed.
  await goToSection(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await choose(page, "Type", "Income");
  expect(
    await optionsOf(page, "Category (optional)"),
  ).toEqual([
    "Uncategorized",
    "Dividends",
    "Freelance",
    "Other income",
    "Salary",
  ]);
  await choose(page, "Type", "Expense");
  expect(
    await optionsOf(page, "Category (optional)"),
  ).toContain("Pets");
  const pets = after.expense.find((c: { name: string }) => c.name === "Pets");
  expect((await post(page, { categoryId: pets.id })).status()).toBe(200);
  const dividends = after.income.find(
    (c: { name: string }) => c.name === "Dividends",
  );
  // Lists stay separate: an income category cannot classify an expense.
  expect((await post(page, { categoryId: dividends.id })).status()).toBe(400);
});

test("names are bounded and duplicates are refused consistently", async ({
  page,
}) => {
  await manage(page);
  await page.getByLabel("New expense category").fill("   ");
  await page.getByRole("button", { name: "Add expense category" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Change needs attention" }),
  ).toContainText("1 to 40 characters");
  expect(await lists(page).then((l) => l.expense)).toHaveLength(8);
  // Only the field the change came from is marked, and the other list's field is
  // left alone.
  await expect(page.getByLabel("New expense category")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("New income category")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await page.getByLabel("New expense category").fill("Travel");
  await page.getByRole("button", { name: "Add expense category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category added.");
  // The pressed control is gone, so focus lands on the outcome, not the body.
  await expect(page.getByRole("status")).toBeFocused();
  for (const name of [
    "",
    "   ",
    "x".repeat(41),
    42,
    null,
    "bad\nname",
  ] as unknown[])
    expect(
      (
        await change(page, { action: "create", kind: "expense", name })
      ).status(),
    ).toBe(400);
  expect(
    (
      await change(page, { action: "create", kind: "savings", name: "A" })
    ).status(),
  ).toBe(400);
  expect(
    (
      await change(page, { action: "merge", kind: "expense", name: "A" })
    ).status(),
  ).toBe(400);
  expect((await change(page, { action: "create", name: "A" })).status()).toBe(
    400,
  );
  // Duplicates are refused case-insensitively within one list, and the same
  // name may exist in the other list.
  const duplicate = await change(page, {
    action: "create",
    kind: "expense",
    name: "travel",
  });
  expect(duplicate.status()).toBe(400);
  expect((await duplicate.json()).field).toBe("name");
  expect(
    (
      await change(page, { action: "create", kind: "income", name: "Travel" })
    ).status(),
  ).toBe(200);
  const current = await lists(page);
  expect(
    current.expense.filter((c: { name: string }) => /travel/i.test(c.name)),
  ).toHaveLength(1);
  // Renaming onto an existing name in the same list is refused the same way.
  const travel = current.expense.find(
    (c: { name: string }) => c.name === "Travel",
  );
  const rename = await change(page, {
    action: "rename",
    id: travel.id,
    name: "dining",
  });
  expect(rename.status()).toBe(400);
  expect((await rename.json()).field).toBe("name");
  // Renaming a category to its own name is not a duplicate.
  expect(
    (
      await change(page, { action: "rename", id: travel.id, name: "Travel" })
    ).status(),
  ).toBe(200);
});

test("renaming keeps category identity across entries and summaries", async ({
  page,
}) => {
  await manage(page);
  const initial = await lists(page);
  const groceries = initial.expense.find(
    (c: { name: string }) => c.name === "Groceries",
  );
  expect(
    (await post(page, { amount: "120", categoryId: groceries.id })).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Rename Groceries", exact: true })
    .click();
  await page.getByLabel("New name for Groceries").fill("Supermarket");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Category renamed.");
  await expect(
    page.getByRole("button", { name: "Rename Supermarket", exact: true }),
  ).toBeVisible();
  const summary = await (await page.request.get("/api/journal")).json();
  expect(summary.entries[0].categoryId).toBe(groceries.id);
  expect(summary.entries[0].category).toBe("Supermarket");
  expect(summary.breakdown).toEqual([
    { categoryId: groceries.id, category: "Supermarket", amount: "120.00" },
  ]);
  await goToSection(page, "Entries");
  await expect(
    page.getByText("Expense · Supermarket", { exact: true }),
  ).toBeVisible();
  // A starter category keeps its identity, so no replacement row appears.
  expect(await lists(page).then((l) => l.expense)).toHaveLength(8);
});

test("archiving preserves history and restoring reuses the same category", async ({
  page,
}, testInfo) => {
  await manage(page);
  const initial = await lists(page);
  const dining = initial.expense.find(
    (c: { name: string }) => c.name === "Dining",
  );
  expect(
    (await post(page, { amount: "300", categoryId: dining.id })).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Archive Dining", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Category archived.");
  const archived = page.getByRole("region", { name: "Archived categories" });
  await expect(
    archived.getByRole("button", { name: "Restore Dining", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("archived-categories.png"),
    fullPage: true,
  });
  expect(
    (await lists(page)).expense.find((c: { id: string }) => c.id === dining.id)
      .active,
  ).toBe(false);
  // The archived category leaves the choices for new entries…
  const summary = await (await page.request.get("/api/journal")).json();
  expect(summary.categories.map((c: { name: string }) => c.name)).not.toContain(
    "Dining",
  );
  // …while the recorded expense, its total and its breakdown keep it.
  expect(summary.entries[0].category).toBe("Dining");
  expect(summary.expenses).toBe("300.00");
  expect(summary.breakdown).toEqual([
    { categoryId: dining.id, category: "Dining", amount: "300.00" },
  ]);
  expect((await post(page, { categoryId: dining.id })).status()).toBe(400);
  // The entry form on the overview offers exactly the active categories.
  await goToSection(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await choose(page, "Type", "Expense");
  expect(
    await optionsOf(page, "Category (optional)"),
  ).not.toContain("Dining");
  await goToSection(page, "Categories");
  await page
    .getByRole("button", { name: "Restore Dining", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Category restored.");
  const restored = await lists(page);
  expect(
    restored.expense.filter((c: { name: string }) => c.name === "Dining"),
  ).toHaveLength(1);
  expect(
    restored.expense.find((c: { id: string }) => c.id === dining.id).active,
  ).toBe(true);
  await goToSection(page, "Entries");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await choose(page, "Type", "Expense");
  expect(
    await optionsOf(page, "Category (optional)"),
  ).toContain("Dining");
  await goToSection(page, "Categories");
  expect((await post(page, { categoryId: dining.id })).status()).toBe(200);
  const after = await (await page.request.get("/api/journal")).json();
  expect(after.expenses).toBe("301.00");
  expect(after.entries).toHaveLength(2);
  expect(after.breakdown).toEqual([
    { categoryId: dining.id, category: "Dining", amount: "301.00" },
  ]);
  // Archiving every expense category leaves the optional workflow intact.
  for (const category of restored.expense)
    expect(
      (await change(page, { action: "archive", id: category.id })).status(),
    ).toBe(200);
  expect((await post(page, { amount: "5" })).status()).toBe(200);
  const uncategorized = await (await page.request.get("/api/journal")).json();
  expect(
    uncategorized.categories.filter(
      (c: { kind: string }) => c.kind === "expense",
    ),
  ).toHaveLength(0);
  expect(
    uncategorized.breakdown.find(
      (group: { category: string }) => group.category === "Uncategorized",
    ).amount,
  ).toBe("5.00");
  expect(
    uncategorized.entries.filter(
      (e: { category: string }) => e.category === "Dining",
    ),
  ).toHaveLength(2);
});

test("signing in again does not reseed renamed or archived starter categories", async ({
  page,
  browser,
}) => {
  await manage(page);
  const initial = await lists(page);
  const housing = initial.expense.find(
    (c: { name: string }) => c.name === "Housing",
  );
  const salary = initial.income.find(
    (c: { name: string }) => c.name === "Salary",
  );
  expect(
    (
      await change(page, { action: "rename", id: housing.id, name: "Rent" })
    ).status(),
  ).toBe(200);
  expect(
    (await change(page, { action: "archive", id: salary.id })).status(),
  ).toBe(200);
  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await manage(secondPage);
  const reopened = await lists(secondPage);
  expect(reopened.expense.map((c: { name: string }) => c.name).sort()).toEqual([
    "Dining",
    "Entertainment",
    "Groceries",
    "Health",
    "Rent",
    "Shopping",
    "Transport",
    "Utilities",
  ]);
  expect(
    reopened.income.find((c: { id: string }) => c.id === salary.id).active,
  ).toBe(false);
  expect(reopened.income).toHaveLength(3);
  await second.close();
});

test("category changes are scoped to the signed-in owner", async ({
  page,
  request,
}) => {
  await manage(page);
  const mine = await lists(page);
  const foreignOwner = randomUUID(),
    foreignCategory = randomUUID();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,$2,$3,true,now(),now())',
    [foreignOwner, "Foreign", `${foreignOwner}@example.test`],
  );
  await pool.query(
    "INSERT INTO category(id,owner_id,kind,name) VALUES ($1,$2,'expense','Private category')",
    [foreignCategory, foreignOwner],
  );
  for (const data of [
    { action: "rename", id: foreignCategory, name: "Stolen" },
    { action: "archive", id: foreignCategory },
    { action: "restore", id: foreignCategory },
    { action: "rename", id: randomUUID(), name: "Ghost" },
    { action: "archive", id: "not-a-uuid" },
  ])
    expect((await change(page, data)).status()).toBe(400);
  expect(JSON.stringify(await lists(page))).not.toContain("Private");
  expect(
    (
      await pool.query("SELECT name, active FROM category WHERE id=$1", [
        foreignCategory,
      ])
    ).rows,
  ).toEqual([{ name: "Private category", active: true }]);
  expect((await request.get("/api/categories")).status()).toBe(401);
  expect((await request.post("/api/categories", { data: {} })).status()).toBe(
    401,
  );
  expect(
    (
      await page.request.post("/api/categories", {
        headers: { Origin: "https://foreign.test" },
        data: { action: "archive", id: mine.income[0].id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.post("/api/categories", { data: {} })).status(),
  ).toBe(403);
  const response = await page.request.get("/api/categories");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual(mine);
});

test("the page reports a failed load and phone layout stays within the viewport", async ({
  page,
}) => {
  await manage(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await pool.query("ALTER TABLE category RENAME TO unavailable_category");
  try {
    await page.reload();
    await expect(
      page.getByRole("alert").filter({ hasText: "Categories unavailable" }),
    ).toBeVisible();
    expect((await page.request.get("/api/categories")).status()).toBe(503);
  } finally {
    await pool.query("ALTER TABLE unavailable_category RENAME TO category");
  }
  await page.getByRole("button", { name: "Retry categories" }).click();
  await expect(
    page.getByRole("button", { name: "Archive Dining", exact: true }),
  ).toBeVisible();
});
