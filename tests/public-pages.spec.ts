import { test, expect } from "@playwright/test";
import { SUPPORT_EMAIL } from "../src/lib/site";
import { nativeClient, nativeSignIn, signIn } from "./helpers";

const publicPages = [
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/support", heading: "Support" },
] as const;

test("privacy and support are public and linked from sign-in", async ({
  page,
  request,
}) => {
  for (const publicPage of publicPages) {
    const response = await request.get(publicPage.path, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers().location).toBeUndefined();

    await page.goto(publicPage.path);
    await expect(page).toHaveURL(new RegExp(`${publicPage.path}$`));
    await expect(
      page.getByRole("heading", { name: publicPage.heading, level: 1 }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }

  await page.goto("/login");
  const privacyLink = page.getByRole("link", { name: "Privacy Policy" });
  await expect(privacyLink).toHaveAttribute("href", "/privacy");
  await privacyLink.click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("the public copy covers the policy and support topics", async ({ page }) => {
  await page.goto("/privacy");
  for (const heading of [
    "What Finance Buddy collects",
    "Why this data is used",
    "Who processes the data",
    "What Finance Buddy does not do",
    "Retention and deletion",
    "Contact",
  ])
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByText(SUPPORT_EMAIL)).toBeVisible();

  await page.goto("/support");
  for (const heading of [
    "How do I sign in with Google or Apple?",
    "Why did Hide My Email open a separate journal?",
    "How do I connect Google Sheets?",
    "How do I export a PDF?",
    "How do I delete my account?",
  ])
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByText(SUPPORT_EMAIL)).toBeVisible();
});

test("privacy and support stay available with signed-in browser sessions", async ({
  page,
}) => {
  await signIn(page);
  for (const publicPage of publicPages) {
    await page.goto(publicPage.path);
    await expect(page).toHaveURL(new RegExp(`${publicPage.path}$`));
    await expect(
      page.getByRole("heading", { name: publicPage.heading, level: 1 }),
    ).toBeVisible();
  }
});

test(
  "privacy and support accept bearer-only requests without cookies",
  async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    const { bearer } = await nativeSignIn();
    expect(bearer).toBeTruthy();
    const app = nativeClient(bearer);

    for (const publicPage of publicPages) {
      const response = await app(publicPage.path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(publicPage.heading);
    }
  },
);
