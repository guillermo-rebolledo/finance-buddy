import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  appOrigin,
  signIn,
  goToSection,
  nativeSignIn,
  nativeClient,
  expectRefusal,
  appleAnswers,
  googleAnswers,
  nativeAppleSignIn,
  appleSignIn,
} from "./helpers";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async () => {
  await appleAnswers();
  await googleAnswers();
  await pool.query('TRUNCATE "user" CASCADE');
});
test.afterAll(async () => {
  await pool.end();
});

test("deleting from Settings ends browser and native sessions and starts a fresh journal", async ({
  page,
}) => {
  const app = nativeClient((await nativeSignIn()).bearer);
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const journal = await (await page.request.get("/api/journal")).json();
  expect(
    (
      await page.request.post("/api/journal", {
        headers: { Origin: appOrigin },
        data: {
          id: randomUUID(),
          kind: "expense",
          amount: "25",
          date: journal.today,
          categoryId: null,
          note: "Delete this financial movement",
        },
      })
    ).status(),
  ).toBe(200);
  await goToSection(page, "Settings");
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete account?",
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?account=deleted$/);
  await expect(page.getByRole("status")).toContainText(
    "Your account was deleted.",
  );
  await expect(page.getByRole("status")).toBeFocused();
  await expectRefusal(await app("/api/private"), "unauthenticated", 401);
  await expectRefusal(
    await page.request.get("/api/private"),
    "unauthenticated",
    401,
  );
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  expect(
    (await (await page.request.get("/api/journal")).json()).entries,
  ).toEqual([]);
});

test("an Apple-linked journal requests fresh Apple authorization before deleting", async ({
  page,
}) => {
  const app = await nativeAppleSignIn();
  await page.route("https://appleid.cdn-apple.com/**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
      window.AppleID = { auth: {
        init(config) { this.config = config; },
        async signIn() {
          if (this.config.clientId !== 'test-apple-service' || this.config.redirectURI !== '${appOrigin}/api/auth/callback/apple' || !this.config.usePopup) throw new Error('Wrong Apple configuration');
          return { authorization: { code: 'delete-web', state: this.config.state } };
        }
      } };
    `,
    });
  });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await goToSection(page, "Settings");
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete account?",
  });
  await confirmation
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(confirmation.getByRole("status")).toContainText(
    "Authorize Apple",
  );
  await confirmation
    .getByRole("button", { name: "Authorize Apple and delete" })
    .click();
  await expect(page).toHaveURL(/\/login\?account=deleted$/);
  await expectRefusal(await app("/api/private"), "unauthenticated", 401);
});

test("confirmation explains every consequence and can be opened and cancelled by keyboard", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const before = await (await page.request.get("/api/journal")).json();
  await goToSection(page, "Settings");
  const trigger = page.getByRole("button", {
    name: "Delete account",
    exact: true,
  });
  for (
    let tab = 0;
    tab < 40 &&
    !(await trigger.evaluate((el) => el === document.activeElement));
    tab++
  )
    await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Delete account?" });
  await expect(dialog).toHaveAccessibleDescription(
    "Your financial movements, categories, budgets and export history will be permanently deleted. Spreadsheets already exported to Google Drive, and PDFs you saved, are not deleted. Every session ends, including the iPhone app and other browsers. If you sign in with Google and Apple using the same verified email, the one shared journal is deleted.",
  );
  await expect(
    dialog.getByRole("button", { name: "Keep account" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Delete account", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await (await page.request.get("/api/journal")).json()).toEqual(before);
});

for (const failure of ["refusal", "network"]) {
  test(`${failure} keeps the user signed in with an announced failure and allows retry`, async ({
    page,
  }) => {
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const before = await (await page.request.get("/api/journal")).json();
    await goToSection(page, "Settings");
    await page.route(
      "**/api/account",
      async (route) => {
        if (failure === "network") await route.abort();
        else
          await route.fulfill({ status: 503, json: { code: "not_confirmed" } });
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Delete account", exact: true })
        .getByRole("alert"),
    ).toContainText("Nothing was deleted. Please try again.");
    await expect(page).toHaveURL(/\/settings$/);
    expect(await (await page.request.get("/api/journal")).json()).toEqual(
      before,
    );
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/login\?account=deleted$/);
  });
}

for (const outcome of ["cancelled", "wrong-state", "load-failed"]) {
  test(`Apple ${outcome} preserves the shared journal and allows a fresh attempt`, async ({
    page,
  }) => {
    const app = await nativeAppleSignIn();
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const before = await (await app("/api/journal")).json();
    await page.route("https://appleid.cdn-apple.com/**", async (route) => {
      if (outcome === "load-failed") return route.abort();
      await route.fulfill({
        contentType: "application/javascript",
        body: `
        window.AppleID = { auth: {
          init(config) { this.config = config; },
          async signIn() {
            ${outcome === "cancelled" ? "throw { error: 'user_cancelled_authorize' };" : "return { authorization: { code: 'delete-web', state: 'different-state' } };"}
          }
        } };
      `,
      });
    });
    await goToSection(page, "Settings");
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    if (outcome !== "load-failed")
      await page
        .getByRole("button", { name: "Authorize Apple and delete" })
        .click();
    await expect(
      page
        .getByRole("region", { name: "Delete account", exact: true })
        .getByRole("alert"),
    ).toContainText("Nothing was deleted. Please try again.");
    await expect(page).toHaveURL(/\/settings$/);
    expect(await (await app("/api/journal")).json()).toEqual(before);
    expect((await page.request.get("/api/private")).status()).toBe(200);
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await expect(
      page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete account", exact: true }),
    ).toBeEnabled();
  });
}

test("an Apple browser user can retry a revocation refusal and delete their account", async ({
  page,
}) => {
  await appleSignIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await appleAnswers("revoke-failed");
  await goToSection(page, "Settings");
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Delete account", exact: true })
      .getByRole("alert"),
  ).toContainText("Nothing was deleted. Please try again.");
  expect((await page.request.get("/api/private")).status()).toBe(200);
  await appleAnswers();
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?account=deleted$/);
});
