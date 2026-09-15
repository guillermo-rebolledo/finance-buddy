import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  moveClockTo,
  appOrigin,
  signIn,
  appleSignIn,
  createdSpreadsheets,
  forgetSpreadsheets,
  appleAnswers,
  forgetProviderRequests,
  googleAnswers,
  providerRequests,
  expectRefusal,
  nativeAppleSignIn,
  nativeClient,
  nativeSignIn,
  resetClock,
} from "./helpers";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await appleAnswers();
  await googleAnswers();
  await forgetProviderRequests();
  await pool.query('TRUNCATE "user" CASCADE');
});
test.afterAll(async () => {
  await pool.end();
  await appleAnswers();
  await googleAnswers();
  await resetClock();
});

test("deleting a user identity ends every session and signing in again starts an empty journal", async () => {
  const first = await nativeSignIn();
  const app = nativeClient(first.bearer);
  const webSession = await nativeSignIn();
  const cookie = webSession.response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .find((pair) => pair.startsWith("better-auth.session_token="))!;
  expect(cookie).toBeTruthy();
  const web = nativeClient();
  const initial = await (await app("/api/journal")).json();
  expect(
    (
      await app("/api/journal", {
        method: "POST",
        body: {
          id: randomUUID(),
          kind: "expense",
          amount: "25",
          date: initial.today,
          categoryId: initial.categories[0].id,
          note: "Remove me",
        },
      })
    ).status,
  ).toBe(200);
  const original = await (await app("/api/private")).json();
  const deleted = await app("/api/account", { method: "DELETE" });
  expect(deleted.status).toBe(204);
  expect(await deleted.text()).toBe("");
  expect(deleted.headers.get("cache-control")).toContain("no-store");
  await expectRefusal(await app("/api/private"), "unauthenticated", 401);
  await expectRefusal(
    await web("/api/private", { headers: { Cookie: cookie } }),
    "unauthenticated",
    401,
  );
  const returning = nativeClient((await nativeSignIn()).bearer);
  expect(await (await returning("/api/private")).json()).not.toEqual(original);
  const fresh = await (await returning("/api/journal")).json();
  expect(fresh.entries).toEqual([]);
  expect(
    fresh.categories.map((category: { name: string }) => category.name),
  ).toEqual(
    initial.categories.map((category: { name: string }) => category.name),
  );
});

test("an Apple sign-in account without a revocable token requires authorization and retains its journal", async () => {
  const app = await nativeAppleSignIn();
  await seedJournal(app);
  const before = await journalState(app);
  await expectRefusal(
    await app("/api/account", { method: "DELETE" }),
    "apple_authorization_required",
    403,
  );
  expect(await journalState(app)).toEqual(before);
});

test("a native Apple authorization code is exchanged and revoked with the bundle-ID secret", async () => {
  const app = await nativeAppleSignIn();
  expect(
    (
      await app("/api/account", {
        method: "DELETE",
        body: { appleAuthorizationCode: "delete-native" },
      })
    ).status,
  ).toBe(204);
  const requests = await providerRequests("apple");
  expect(requests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "/auth/token",
        code: "delete-native",
        client_id: "test-apple-ios",
        client_secret: "test-apple-ios-secret",
        grant_type: "authorization_code",
      }),
      expect.objectContaining({
        path: "/auth/revoke",
        token: "refresh-delete-native",
        client_id: "test-apple-ios",
        client_secret: "test-apple-ios-secret",
        token_type_hint: "refresh_token",
      }),
    ]),
  );
  await expectRefusal(await app("/api/journal"), "unauthenticated", 401);
});

for (const directive of ["", "revoke-failed", "revoke-silent"]) {
  test(`Google sign-in and Sheets grants are revoked and deletion completes even for ${directive || "success"}`, async ({
    page,
  }) => {
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const grant = await page.request.post("/api/auth/link-social", {
      headers: { Origin: appOrigin },
      data: {
        provider: "google",
        scopes: ["https://www.googleapis.com/auth/drive.file"],
        additionalParams: { access_type: "offline", prompt: "consent" },
        callbackURL: "/dashboard?sheets=connected",
      },
    });
    await page.goto((await grant.json()).url);
    await expect(page).toHaveURL(/sheets=connected/);
    const app = nativeClient((await nativeSignIn()).bearer);
    await forgetSpreadsheets();
    const id = randomUUID();
    expect(
      (await app("/api/journal/spreadsheet", { method: "POST", body: { id } }))
        .status,
    ).toBe(200);
    const snapshots = await createdSpreadsheets();
    expect(snapshots).toHaveLength(1);
    await googleAnswers(directive);
    expect((await app("/api/account", { method: "DELETE" })).status).toBe(204);
    expect(await providerRequests("google")).toEqual(
      expect.arrayContaining([
        { token: "controlled-refresh" },
        { token: "controlled-export-token" },
      ]),
    );
    await expectRefusal(await app("/api/private"), "unauthenticated", 401);
    await expectRefusal(
      await page.request.get("/api/private"),
      "unauthenticated",
      401,
    );
    expect(await createdSpreadsheets()).toEqual(snapshots);
    const returning = nativeClient((await nativeSignIn()).bearer);
    await expectRefusal(
      await returning("/api/journal/spreadsheet", {
        method: "POST",
        body: { id },
      }),
      "reconnect_required",
      403,
    );
  });
}

async function seedJournal(app: ReturnType<typeof nativeClient>) {
  const initial = await (await app("/api/journal")).json();
  expect(
    (
      await app("/api/categories", {
        method: "POST",
        body: { action: "create", kind: "expense", name: "Private category" },
      })
    ).status,
  ).toBe(200);
  const categories = await (await app("/api/categories")).json();
  expect(
    (
      await app("/api/journal", {
        method: "POST",
        body: {
          id: randomUUID(),
          kind: "expense",
          amount: "25",
          date: initial.today,
          categoryId: initial.categories[0].id,
          note: "Private financial movement",
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app("/api/budgets", {
        method: "PUT",
        body: { amount: "100", oneOff: false },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app("/api/budgets?kind=day", {
        method: "PUT",
        body: { amount: "40", oneOff: true },
      })
    ).status,
  ).toBe(200);
  return categories;
}
async function journalState(app: ReturnType<typeof nativeClient>) {
  return Promise.all(
    ["/api/private", "/api/journal", "/api/categories", "/api/budgets"].map(
      async (path) => {
        const response = await app(path);
        expect(response.status).toBe(200);
        return response.json();
      },
    ),
  );
}

test("deletion leaves another user's financial movements, categories, budgets, and sessions unchanged", async () => {
  const app = nativeClient((await nativeSignIn()).bearer);
  const otherSignIn = await nativeSignIn({ identity: "stranger" });
  const other = nativeClient(otherSignIn.bearer);
  // Seeding at noon in Mexico City two days ago and reading from the day after
  // ends the seeded day budget without moving the clock past the real date,
  // which later sign-ins would carry into the session-expiry specs.
  const day = 24 * 60 * 60 * 1000;
  let seeded = Date.parse(
    `${new Date(Date.now() - 2 * day).toISOString().slice(0, 10)}T18:00:00Z`,
  );
  // Only the day ends: not a Sunday, which ends the week, nor a month's last day.
  while (
    new Date(seeded).getUTCDay() === 0 ||
    new Date(seeded + day).getUTCDate() === 1
  )
    seeded -= day;
  await moveClockTo(new Date(seeded).toISOString());
  await seedJournal(app);
  await seedJournal(other);
  await moveClockTo(new Date(seeded + day).toISOString());
  const before = await journalState(other);
  expect(before[3].past).toHaveLength(1);
  expect(
    (await app("/api/account", { method: "DELETE", body: {} })).status,
  ).toBe(204);
  expect(await journalState(other)).toEqual(before);
  const returning = nativeClient((await nativeSignIn()).bearer);
  const fresh = await journalState(returning);
  expect(fresh[1].entries).toEqual([]);
  expect(JSON.stringify(fresh[2])).not.toContain("Private category");
  expect(fresh[3]).toMatchObject({
    now: { day: null, week: null, month: null },
    repeating: [],
    upcoming: [],
    past: [],
  });
});

for (const directive of [
  "exchange-failed",
  "exchange-silent",
  "no-token",
  "revoke-failed",
  "revoke-silent",
]) {
  test(`Apple ${directive} refuses deletion and preserves the user's records`, async () => {
    const app = await nativeAppleSignIn();
    await seedJournal(app);
    const before = await journalState(app);
    await appleAnswers(directive);
    await expectRefusal(
      await app("/api/account", {
        method: "DELETE",
        body: { appleAuthorizationCode: "delete-native" },
      }),
      "apple_revocation_failed",
      503,
    );
    expect(await journalState(app)).toEqual(before);
    expect(await providerRequests("google")).toEqual([]);
  });
}

test("an Apple code for another sign-in account cannot authorize deletion", async () => {
  const app = await nativeAppleSignIn();
  await seedJournal(app);
  const before = await journalState(app);
  await expectRefusal(
    await app("/api/account", {
      method: "DELETE",
      body: { appleAuthorizationCode: "delete-stranger" },
    }),
    "apple_revocation_failed",
    503,
  );
  expect(await journalState(app)).toEqual(before);
  expect(
    (await providerRequests("apple")).filter(
      (request) => request.path === "/auth/revoke",
    ),
  ).toEqual([]);
});

test("native deletion refuses a code when the bundle-ID secret is missing", async () => {
  const app = await nativeAppleSignIn("http://127.0.0.1:3103");
  await seedJournal(app);
  const before = await journalState(app);
  await expectRefusal(
    await app("/api/account", {
      method: "DELETE",
      body: { appleAuthorizationCode: "delete-native" },
    }),
    "apple_revocation_failed",
    503,
  );
  expect(await journalState(app)).toEqual(before);
  expect(await providerRequests("apple")).toEqual([]);
});

for (const directive of ["", "web-refresh"]) {
  test(`stored Apple ${directive || "access"} tokens can authorize deletion without a new code`, async ({
    page,
  }) => {
    await appleAnswers(directive);
    await appleSignIn(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const deleted = await page.request.delete("/api/account", {
      headers: { Origin: appOrigin },
    });
    expect(deleted.status()).toBe(204);
    const expected = [
      expect.objectContaining({
        path: "/auth/revoke",
        token: "controlled-apple-token",
        token_type_hint: "access_token",
        client_id: "test-apple-service",
        client_secret: "test-apple-secret",
      }),
    ];
    if (directive)
      expected.push(
        expect.objectContaining({
          token: "controlled-apple-refresh",
          token_type_hint: "refresh_token",
        }),
      );
    expect(await providerRequests("apple")).toEqual(
      expect.arrayContaining(expected),
    );
    await expectRefusal(
      await page.request.get("/api/private"),
      "unauthenticated",
      401,
    );
  });
}

test("web Apple codes use the Services ID and stored tokens are revoked too", async ({
  page,
}) => {
  await appleSignIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  expect(
    (
      await page.request.delete("/api/account", {
        headers: { Origin: appOrigin },
        data: { appleAuthorizationCode: "delete-web" },
      })
    ).status(),
  ).toBe(204);
  expect(await providerRequests("apple")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "/auth/token",
        code: "delete-web",
        client_id: "test-apple-service",
        client_secret: "test-apple-secret",
      }),
      expect.objectContaining({
        path: "/auth/revoke",
        token: "refresh-delete-web",
        client_id: "test-apple-service",
        client_secret: "test-apple-secret",
      }),
      expect.objectContaining({
        path: "/auth/revoke",
        token: "controlled-apple-token",
        client_id: "test-apple-service",
        client_secret: "test-apple-secret",
      }),
    ]),
  );
});

for (const fails of [false, true]) {
  test(`native code revocation also revokes the stored web Apple grant${fails ? " and refuses if it fails" : ""}`, async ({
    page,
  }) => {
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: appOrigin },
      data: {},
    });
    await appleSignIn(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const app = await nativeAppleSignIn();
    await seedJournal(app);
    const before = await journalState(app);
    if (fails) await appleAnswers("stored-revoke-failed");
    const response = await app("/api/account", {
      method: "DELETE",
      body: { appleAuthorizationCode: "delete-native" },
    });
    expect(await providerRequests("apple")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "refresh-delete-native",
          client_id: "test-apple-ios",
          client_secret: "test-apple-ios-secret",
        }),
        expect.objectContaining({
          token: "controlled-apple-token",
          client_id: "test-apple-service",
          client_secret: "test-apple-secret",
        }),
      ]),
    );
    if (fails) {
      await expectRefusal(response, "apple_revocation_failed", 503);
      expect(await journalState(app)).toEqual(before);
      expect((await page.request.get("/api/private")).status()).toBe(200);
      expect(await providerRequests("google")).toEqual([]);
    } else {
      expect(response.status).toBe(204);
      expect(await providerRequests("google")).toEqual([
        { token: "controlled-token" },
      ]);
      await expectRefusal(
        await page.request.get("/api/private"),
        "unauthenticated",
        401,
      );
    }
  });
}

test("deletion enforces sessions, Origin integrity, the build gate, and valid optional JSON", async () => {
  const signedIn = await nativeSignIn();
  const app = nativeClient(signedIn.bearer);
  const cookie = signedIn.response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .find((pair) => pair.startsWith("better-auth.session_token="))!;
  await seedJournal(app);
  const before = await journalState(app);
  await expectRefusal(
    await nativeClient()("/api/account", { method: "DELETE" }),
    "unauthenticated",
    401,
  );
  await expectRefusal(
    await nativeClient("invalid")("/api/account", {
      method: "DELETE",
      headers: { Cookie: cookie },
    }),
    "unauthenticated",
    401,
  );
  const cookieRequests: Record<string, string>[] = [
    { Cookie: cookie },
    { Cookie: cookie, Origin: "https://foreign.example" },
  ];
  for (const headers of cookieRequests) {
    await expectRefusal(
      await nativeClient()("/api/account", { method: "DELETE", headers }),
      "request_not_allowed",
      403,
    );
  }
  await expectRefusal(
    await app("/api/account", {
      method: "DELETE",
      headers: { Origin: "https://foreign.example" },
    }),
    "request_not_allowed",
    403,
  );
  await expectRefusal(
    await app("/api/account", {
      method: "DELETE",
      headers: { "X-Finance-Buddy-Build": "11" },
    }),
    "upgrade_required",
    426,
  );
  await expectRefusal(
    await app("/api/account", {
      method: "DELETE",
      body: {},
      headers: { "Content-Type": "text/plain" },
    }),
    "request_not_allowed",
    403,
  );
  for (const body of [
    "{",
    "null",
    "[]",
    { appleAuthorizationCode: 12 },
    { appleAuthorizationCode: " " },
  ]) {
    await expectRefusal(
      await app("/api/account", { method: "DELETE", body }),
      "invalid_field",
      400,
    );
  }
  expect(await journalState(app)).toEqual(before);
  expect(await providerRequests("apple")).toEqual([]);
  expect(await providerRequests("google")).toEqual([]);
});
