import { test, expect } from "@playwright/test";
import {
  expectRefusal,
  moveClockTo,
  nativeClient,
  nativeSignIn,
  resetClock,
  signIn,
} from "./helpers";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async ({}, testInfo) => {
  // A native client has no viewport, so its requests are exercised once.
  test.skip(testInfo.project.name !== "desktop");
  await pool.query("TRUNCATE financial_movement, category, category_seed");
});
test.afterAll(async () => {
  await pool.end();
  await resetClock();
});

test("the owner signs in natively and reads the same journal as the web with a bearer token", async ({
  page,
}) => {
  const callback = page.waitForResponse((response) =>
    response.url().includes("/api/auth/callback/google"),
  );
  await signIn(page);
  // A browser keeps its session in the HTTP-only cookie; page scripts never
  // receive the token.
  expect((await callback).headers()["set-auth-token"]).toBeUndefined();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const web = await (await page.request.get("/api/private")).json();

  const { response, bearer } = await nativeSignIn();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ redirect: false });
  expect(bearer).toBeTruthy();
  const app = nativeClient(bearer);
  // The same owner, the same user record, whichever client signed in.
  expect(await (await app("/api/private")).json()).toEqual(web);

  await moveClockTo("2026-09-11T18:00:00Z");
  const report = await (await page.request.get("/api/journal")).json();
  const groceries = report.categories.find(
    (category: { name: string }) => category.name === "Groceries",
  );
  for (const [kind, amount, categoryId] of [
    ["income", "1200.50", null],
    ["expense", "300", groceries.id],
    ["refund", "20", groceries.id],
  ])
    expect(
      (
        await page.request.post("/api/journal", {
          headers: { Origin: origin },
          data: {
            id: randomUUID(),
            kind,
            amount,
            date: "2026-09-10",
            categoryId,
            note: "Recorded on the web",
          },
        })
      ).status(),
    ).toBe(200);
  // Every read the web makes answers the app identically, and stays private.
  for (const path of [
    "/api/journal",
    "/api/journal?kind=day&date=2026-09-10",
    "/api/journal?kind=month&date=2026-09-11",
    "/api/journal/trends?kind=week&date=2026-09-11",
    "/api/categories",
  ]) {
    const mine = await app(path);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("cache-control")).toContain("no-store");
    expect(await mine.json()).toEqual(await (await page.request.get(path)).json());
  }
  expect((await (await app("/api/journal")).json()).expenses).toBe("280.00");

  // A token issued to the web client is accepted as well as the iOS client's.
  const second = await nativeSignIn({ audience: "test-client" });
  expect(second.response.status).toBe(200);
  expect(await (await nativeClient(second.bearer)("/api/private")).json()).toEqual(
    web,
  );
});

for (const identity of ["stranger", "unverified", "changed"] as const) {
  test(`a Google ${identity} identity never becomes a native session`, async () => {
    const { response, bearer } = await nativeSignIn({ identity });
    expect(response.ok).toBe(false);
    expect(bearer).toBeNull();
    const reply = await response.json().catch(() => null);
    await expectRefusal(
      await nativeClient(reply?.token ?? "no-session")("/api/private"),
      "unauthenticated",
      401,
    );
  });
}

test("ID tokens that are foreign, expired, altered, unbound to their nonce or sent cross-site are refused", async () => {
  for (const attempt of [
    { audience: "another-google-client" },
    { age: 2 * 60 * 60 },
    {
      alter: (token: string) => {
        const [header, payload, signature] = token.split(".");
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        const forged = Buffer.from(
          JSON.stringify({ ...claims, email: "owner@example.test", sub: "google-stranger" }),
        ).toString("base64url");
        return [header, forged, signature].join(".");
      },
    },
    { tokenNonce: "a-nonce-issued-to-another-sign-in" },
  ]) {
    const { response, bearer } = await nativeSignIn(attempt);
    expect(response.ok).toBe(false);
    expect(bearer).toBeNull();
  }
  // The nonce is required before the token is even verified.
  const withoutNonce = await nativeSignIn({ sendNonce: false });
  expect(withoutNonce.bearer).toBeNull();
  await expectRefusal(withoutNonce.response, "invalid_field", 400);
  // A present Origin must be this app's, whatever the request carries.
  const crossSite = await nativeSignIn({
    headers: { Origin: "https://attacker.example" },
  });
  expect(crossSite.bearer).toBeNull();
  await expectRefusal(crossSite.response, "request_not_allowed", 403);
  await expectRefusal(await nativeClient()("/api/private"), "unauthenticated", 401);
});

test("only the signed session token works as a bearer, and never with a cookie to fall back on", async () => {
  const { response, bearer } = await nativeSignIn();
  const { token } = await response.json();
  expect(token).toBeTruthy();
  expect(bearer).not.toBe(token);
  expect((await nativeClient(bearer)("/api/private")).status).toBe(200);
  // The raw token a session row stores is not enough on its own.
  await expectRefusal(await nativeClient(token)("/api/private"), "unauthenticated", 401);
  const altered = `${bearer!.startsWith("A") ? "B" : "A"}${bearer!.slice(1)}`;
  await expectRefusal(await nativeClient(altered)("/api/journal"), "unauthenticated", 401);
  await expectRefusal(
    await nativeClient(altered)("/api/categories"),
    "unauthenticated",
    401,
  );
  // The sign-in reply also set the session cookie, which works on its own…
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .find((pair) => pair.startsWith("better-auth.session_token="));
  expect(cookie).toBeTruthy();
  expect(
    (await nativeClient()("/api/private", { headers: { Cookie: cookie! } })).status,
  ).toBe(200);
  // …but a request presenting a token is judged by that token alone.
  await expectRefusal(
    await nativeClient(altered)("/api/private", { headers: { Cookie: cookie! } }),
    "unauthenticated",
    401,
  );
  await expectRefusal(
    await nativeClient()("/api/journal", {
      headers: { Cookie: cookie!, Authorization: "Basic b3duZXI6c2VjcmV0" },
    }),
    "unauthenticated",
    401,
  );
});

test("native sign-in fails closed in a server without owner configuration", async () => {
  const { response, bearer } = await nativeSignIn({ base: "http://127.0.0.1:3101" });
  expect(bearer).toBeNull();
  await expectRefusal(response, "unavailable", 503);
});
