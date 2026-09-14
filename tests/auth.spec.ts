import {
  expectRefusal,
  goToSection,
  nativeClient,
  nativeSignIn,
  openNavigation,
  signIn,
} from "./helpers";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
test.beforeEach(async () => {
  const elapsed = Number(
    await readFile(process.env.TEST_CLOCK_FILE!, "utf8").catch(() => "0"),
  );
  await writeFile(process.env.TEST_CLOCK_FILE!, String(elapsed + 61000));
});
test("unauthenticated requests cannot enter the private home", async ({
  page,
  request,
}, testInfo) => {
  const response = await request.get("/api/private");
  await expectRefusal(response, "unauthenticated", 401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
  });
});

test("verified owner signs in through Google and retains a database-backed session", async ({
  page,
  context,
}, testInfo) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const first = await (await context.request.get("/api/private")).json();
  expect(first.userId).toEqual(expect.any(String));
  expect(first.userId).not.toContain("@");
  await page.reload();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  expect(await (await context.request.get("/api/private")).json()).toEqual(
    first,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
});

for (const identity of ["unverified"]) {
  test(`Google ${identity} identity is rejected without a usable session`, async ({
    page,
    context,
  }) => {
    await signIn(page, identity);
    await expect(page.getByText("That sign-in didn't work")).toBeVisible();
    await expect(page).toHaveURL(/error=(access_denied|email_not_verified)/);
    expect((await context.request.get("/api/private")).status()).toBe(401);
    const session = await context.request.get("/api/auth/get-session");
    expect(await session.json()).toBeNull();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
}

test("sign-out revokes the persisted session, including a copied cookie", async ({
  page,
  context,
  playwright,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const replay = await playwright.request.newContext({
    storageState: await context.storageState(),
  });
  const signOut = page.getByRole("button", { name: "Sign out" });
  await openNavigation(page, signOut);
  await signOut.click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get("/api/private")).status()).toBe(401);
  expect((await replay.get("http://127.0.0.1:3100/api/private")).status()).toBe(
    401,
  );
  await replay.dispose();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("invalid session and forged Google ID token cannot grant access", async ({
  request,
}) => {
  expect(
    (
      await request.get("/api/private", {
        headers: { Cookie: "better-auth.session_token=forged.signature" },
      })
    ).status(),
  ).toBe(401);
  const response = await request.post("/api/auth/sign-in/social", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { provider: "google", idToken: { token: "forged" } },
  });
  expect(response.ok()).toBe(false);
  expect((await request.get("/api/private")).status()).toBe(401);
});

test("callback without state and cross-origin sign-in are refused", async ({
  request,
}) => {
  const callback = await request.get("/api/auth/callback/google?code=owner", {
    maxRedirects: 0,
  });
  expect(callback.headers().location).toContain("/login?error=");
  expect((await request.get("/api/private")).status()).toBe(401);
  const response = await request.post("/api/auth/sign-in/social", {
    headers: { Origin: "https://untrusted.example" },
    data: { provider: "google", callbackURL: "/" },
  });
  await expectRefusal(response, "request_not_allowed", 403);
});

test("password sign-in and email/password registration are unavailable", async ({
  request,
}) => {
  for (const path of ["sign-in/email", "sign-up/email"]) {
    const response = await request.post(`/api/auth/${path}`, {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        name: "Anyone",
        email: "owner@example.test",
        password: "not-a-real-password",
      },
    });
    await expectRefusal(response, "not_found", 404);
  }
});

test("a Google provider failure shows retry feedback without a session", async ({
  page,
  context,
}) => {
  await signIn(page, "provider-failure");
  await expect(page.getByText("That sign-in didn't work")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "That sign-in" })).toContainText(
    "Try signing in again.",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  expect((await context.request.get("/api/private")).status()).toBe(401);
});

test("expired sessions stop working for both the page and protected requests", async ({
  page,
  context,
}) => {
  const previousTime = await readFile(process.env.TEST_CLOCK_FILE!, "utf8");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  try {
    await writeFile(
      process.env.TEST_CLOCK_FILE!,
      String(8 * 24 * 60 * 60 * 1000),
    );
    expect((await context.request.get("/api/private")).status()).toBe(401);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await writeFile(process.env.TEST_CLOCK_FILE!, previousTime);
  }
});

test("missing auth secret fails closed in an ordinary production server", async ({
  page,
  request,
}) => {
  await page.goto("http://127.0.0.1:3101/login");
  await expect(page.getByText("Sign-in isn't ready yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  expect(
    (await request.get("http://127.0.0.1:3101/api/private")).status(),
  ).toBe(503);
  const signin = await request.post(
    "http://127.0.0.1:3101/api/auth/sign-in/social",
    { data: { provider: "google" } },
  );
  await expectRefusal(signin, "unavailable", 503);
  expect(await signin.text()).not.toContain("owner@example.test");
});

test("Sign out everywhere, once confirmed, ends every session including a phone's", async ({
  page,
  context,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const { bearer } = await nativeSignIn();
  const app = nativeClient(bearer);
  expect((await app("/api/private")).status).toBe(200);
  await goToSection(page, "Settings");
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
  const control = page.getByRole("button", { name: "Sign out everywhere" });
  const dialog = page.getByRole("alertdialog", { name: "Sign out everywhere?" });
  await control.click();
  await expect(dialog).toBeVisible();
  // Keeping the sessions changes nothing and returns to the control.
  await dialog.getByRole("button", { name: "Keep sessions" }).click();
  await expect(dialog).toBeHidden();
  await expect(control).toBeFocused();
  expect((await app("/api/private")).status).toBe(200);
  expect((await context.request.get("/api/private")).status()).toBe(200);
  // The control is opened and confirmed from the keyboard alone.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sign out everywhere" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  await expectRefusal(await app("/api/private"), "unauthenticated", 401);
  expect((await context.request.get("/api/private")).status()).toBe(401);
});
