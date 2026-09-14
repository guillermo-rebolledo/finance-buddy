import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test("sidebar navigation preserves the shared frame", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  const originalToggle = await toggle.elementHandle();
  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document")
      documentRequests.push(request.url());
  });

  for (const [destination, path] of [
    ["Categories", "/categories"],
    ["Settings", "/settings"],
    ["Dashboard", "/dashboard"],
    ["Budgets", "/budgets"],
    ["Entries", "/"],
  ]) {
    if (testInfo.project.name === "phone") await toggle.click();
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: destination, exact: true })
      .click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole("main").getByRole("heading").first(),
    ).toBeVisible();
    expect(
      await toggle.evaluate((node, original) => node === original, originalToggle),
    ).toBe(true);
  }
  expect(documentRequests).toEqual([]);
});

test("navigation links work after toggling the sidebar and reloading", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const mobile = testInfo.project.name === "phone";
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.click();
  // Desktop remembers icon-only navigation across reloads. On a phone the
  // same control opens the drawer and choosing a destination should close it.
  if (!mobile) await page.reload();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Categories", level: 1 }),
  ).toBeVisible();
  if (mobile)
    await expect(page.getByRole("navigation", { name: "Sections" })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("navigation.png") });

  await toggle.click();
  await expect(page.getByText("Preferences", { exact: true })).toBeVisible();
  if (!mobile) {
    await page.reload();
    await expect(page.getByText("Preferences", { exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
});
