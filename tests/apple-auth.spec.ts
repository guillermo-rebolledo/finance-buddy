import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import {
  appleIdToken,
  appleSignIn,
  appOrigin,
  expectRefusal,
  nativeClient,
  signIn,
} from "./helpers";
import { readFile, writeFile } from "node:fs/promises";

test.beforeEach(async () => {
  const elapsed = Number(
    await readFile(process.env.TEST_CLOCK_FILE!, "utf8").catch(() => "0"),
  );
  await writeFile(process.env.TEST_CLOCK_FILE!, String(elapsed + 61000));
});

test("verified owner signs in with Apple's form POST and keeps a private session", async ({
  page,
  context,
}) => {
  const callback = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/callback/apple?") &&
      response.status() === 302,
  );
  await appleSignIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const access = await context.request.get("/api/private");
  expect(access.status()).toBe(200);
  const first = await access.json();
  await page.reload();
  expect(await (await context.request.get("/api/private")).json()).toEqual(
    first,
  );
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "session_token",
  );
  expect((await callback).headers()["set-auth-token"]).toBeUndefined();
});

test("Google and Apple sign-ins retain the same owner and journal in both directions", async ({
  page,
  context,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const google = await (await context.request.get("/api/private")).json();
  const report = await (await context.request.get("/api/journal")).json();
  const id = randomUUID();
  expect(
    (
      await context.request.post("/api/journal", {
        headers: { Origin: appOrigin },
        data: {
          id,
          kind: "income",
          amount: "123.45",
          date: report.today,
          categoryId: null,
          note: "Same journal through Apple",
        },
      })
    ).status(),
  ).toBe(200);
  await context.request.post("/api/auth/sign-out", {
    headers: { Origin: appOrigin },
    data: {},
  });
  await appleSignIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  expect(await (await context.request.get("/api/private")).json()).toEqual(
    google,
  );
  const appleJournal = await (await context.request.get("/api/journal")).json();
  expect(appleJournal.entries).toEqual(
    expect.arrayContaining([expect.objectContaining({ id })]),
  );
  await context.request.post("/api/auth/sign-out", {
    headers: { Origin: appOrigin },
    data: {},
  });
  expect((await context.request.get("/api/private")).status()).toBe(401);
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  expect(await (await context.request.get("/api/private")).json()).toEqual(
    google,
  );
  expect(await (await context.request.get("/api/journal")).json()).toEqual(
    appleJournal,
  );
});

for (const identity of [
  "stranger",
  "unverified",
  "changed",
  "relay",
  "provider-failure",
  "cancelled",
]) {
  test(`Apple ${identity} returns retry feedback without a session`, async ({
    page,
    context,
  }) => {
    await appleSignIn(page, identity);
    await expect(page.getByText("Sign-in was not completed")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in with Apple" }),
    ).toBeEnabled();
    expect((await context.request.get("/api/private")).status()).toBe(401);
    expect(
      await (await context.request.get("/api/auth/get-session")).json(),
    ).toBeNull();
  });
}

test("Apple callbacks require state and its original browser; Apple's origin cannot write elsewhere", async ({
  request,
  playwright,
}) => {
  const start = await request.post("/api/auth/sign-in/social", {
    headers: { Origin: appOrigin },
    data: { provider: "apple", callbackURL: "/", errorCallbackURL: "/login" },
  });
  const authorization = new URL((await start.json()).url);
  const stranger = await playwright.request.newContext();
  try {
    const stolen = await stranger.get(
      `${appOrigin}/api/auth/callback/apple?code=owner&state=${authorization.searchParams.get("state")}`,
      { maxRedirects: 0 },
    );
    expect(stolen.headers().location).toContain("/login?error=state_mismatch");
    expect((await stranger.get(`${appOrigin}/api/private`)).status()).toBe(401);
  } finally {
    await stranger.dispose();
  }
  const missing = await request.post("/api/auth/callback/apple", {
    headers: { Origin: "https://appleid.apple.com" },
    form: { code: "owner" },
  });
  expect(missing.url()).toContain("/login?error=state_not_found");
  for (const path of [
    "/api/auth/sign-in/social",
    "/api/auth/link-social",
    "/api/auth/sign-out",
    "/api/auth/revoke-sessions",
    "/api/auth/callback/google",
  ]) {
    await expectRefusal(
      await request.post(path, {
        headers: { Origin: "https://appleid.apple.com" },
        data: { provider: "apple" },
      }),
      "request_not_allowed",
      403,
    );
  }
  for (const origin of ["https://untrusted.example", "null"]) {
    await expectRefusal(
      await request.post("/api/auth/callback/apple", {
        headers: { Origin: origin },
        form: { code: "owner" },
      }),
      "request_not_allowed",
      403,
    );
  }
});

test("native Apple tokens bind the nonce and both configured audiences to the same owner", async ({
  page,
  context,
}) => {
  await appleSignIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const web = await (await context.request.get("/api/private")).json();
  for (const audience of ["test-apple-ios", "test-apple-service"]) {
    const nonce = randomUUID();
    const token = await appleIdToken({
      audience,
      nonce: createHash("sha256").update(nonce).digest("hex"),
    });
    const signedIn = await nativeClient()("/api/auth/sign-in/social", {
      method: "POST",
      body: { provider: "apple", idToken: { token, nonce } },
    });
    expect(signedIn.status).toBe(200);
    const bearer = signedIn.headers.get("set-auth-token");
    expect(bearer).toBeTruthy();
    const app = nativeClient(bearer);
    expect(await (await app("/api/private")).json()).toEqual(web);
    expect(
      (await app("/api/auth/sign-out", { method: "POST", body: {} })).status,
    ).toBe(200);
    await expectRefusal(await app("/api/private"), "unauthenticated", 401);
  }
});

test("native Apple sign-in rejects foreign, expired, forged, unverified, and unbound tokens", async () => {
  const nonce = randomUUID();
  for (const options of [
    { audience: "unconfigured-app" },
    { issuer: "https://untrusted.example" },
    { age: 7200 },
    { nonce: "wrong-nonce" },
    { identity: "stranger" as const },
    { identity: "unverified" as const },
    { identity: "changed" as const },
  ]) {
    const token = await appleIdToken({ nonce, ...options });
    const response = await nativeClient()("/api/auth/sign-in/social", {
      method: "POST",
      body: { provider: "apple", idToken: { token, nonce } },
    });
    expect(response.ok).toBe(false);
    expect(response.headers.get("set-auth-token")).toBeNull();
  }
  for (const idToken of [
    { token: await appleIdToken({ nonce }) },
    { token: "forged.signature.token", nonce },
  ]) {
    const response = await nativeClient()("/api/auth/sign-in/social", {
      method: "POST",
      body: { provider: "apple", idToken },
    });
    expect(response.ok).toBe(false);
    expect(response.headers.get("set-auth-token")).toBeNull();
  }
});

test("the Apple owner can grant Google Sheets access and export", async ({
  page,
  context,
}) => {
  // Installs the controlled Google authorization page too, for the later grant.
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await context.request.post("/api/auth/sign-out", {
    headers: { Origin: appOrigin },
    data: {},
  });
  await appleSignIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const grant = await context.request.post("/api/auth/link-social", {
    headers: { Origin: appOrigin },
    data: {
      provider: "google",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
      additionalParams: { access_type: "offline", prompt: "consent" },
      callbackURL: "/dashboard?sheets=connected",
    },
  });
  expect(grant.status()).toBe(200);
  await page.goto((await grant.json()).url);
  await expect(page).toHaveURL(/sheets=connected/);
  const exported = await context.request.post("/api/journal/spreadsheet", {
    headers: { Origin: appOrigin },
    data: { id: randomUUID() },
  });
  expect(exported.status()).toBe(200);
  expect((await exported.json()).url).toMatch(
    /^https:\/\/docs.google.com\/spreadsheets\//,
  );
});

test("incomplete Apple configuration keeps Google available and hides Apple", async ({
  page,
  request,
}) => {
  const base = "http://127.0.0.1:3102";
  await page.goto(`${base}/login`);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Sign in with Apple" }),
  ).toHaveCount(0);
  const google = await request.post(`${base}/api/auth/sign-in/social`, {
    headers: { Origin: base },
    data: { provider: "google", callbackURL: "/" },
  });
  expect(google.status()).toBe(200);
  expect((await google.json()).url).toMatch(/^https:\/\/accounts.google.com\//);
  const apple = await request.post(`${base}/api/auth/sign-in/social`, {
    headers: { Origin: base },
    data: { provider: "apple", callbackURL: "/" },
  });
  expect(apple.ok()).toBe(false);
  expect((await request.get(`${base}/api/private`)).status()).toBe(401);
});
