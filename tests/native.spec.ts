import { test, expect } from "@playwright/test";
import {
  entryRow,
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

test("the owner records, corrects and deletes movements and manages categories from a native client", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const { bearer } = await nativeSignIn();
  expect(bearer).toBeTruthy();
  const app = nativeClient(bearer);
  await moveClockTo("2026-09-11T18:00:00Z");
  const initial = await (await app("/api/journal")).json();
  const groceries = initial.categories.find(
    (category: { name: string }) => category.name === "Groceries",
  );
  const income = {
    id: randomUUID(),
    kind: "income",
    amount: "5000",
    date: "2026-09-10",
    categoryId: null,
    note: "Recorded on the phone",
  };
  const expense = {
    id: randomUUID(),
    kind: "expense",
    amount: "250.40",
    date: "2026-09-09",
    categoryId: groceries.id,
    note: "",
  };
  const refund = {
    id: randomUUID(),
    kind: "refund",
    amount: "40.40",
    date: "2026-09-11",
    categoryId: groceries.id,
    note: "",
  };
  for (const body of [income, expense, refund])
    expect((await app("/api/journal", { method: "POST", body })).status).toBe(200);
  // A retry after a lost reply records nothing twice, and an identifier never
  // takes other values.
  expect((await app("/api/journal", { method: "POST", body: expense })).status).toBe(200);
  await expectRefusal(
    await app("/api/journal", { method: "POST", body: { ...expense, amount: "999" } }),
    "invalid_field",
    400,
  );
  expect(
    (
      await app("/api/journal", {
        method: "PATCH",
        body: { ...expense, amount: "260.40", date: "2026-09-10" },
      })
    ).status,
  ).toBe(200);
  expect(
    (await app("/api/journal", { method: "DELETE", body: { id: income.id } })).status,
  ).toBe(200);
  await expectRefusal(
    await app("/api/journal", { method: "DELETE", body: { id: income.id } }),
    "invalid_field",
    400,
  );
  const after = await (await app("/api/journal")).json();
  expect(after.entries.map((entry: { id: string }) => entry.id).sort()).toEqual(
    [expense.id, refund.id].sort(),
  );
  expect([after.income, after.expenses]).toEqual(["0.00", "220.00"]);
  // The web reads exactly what the phone wrote.
  expect(after).toEqual(await (await page.request.get("/api/journal")).json());
  await page.reload();
  await expect(entryRow(page, "Expense", "Groceries")).toBeVisible();
  await expect(entryRow(page, "Refund", "Groceries")).toBeVisible();

  const created = randomUUID();
  expect(
    (
      await app("/api/categories", {
        method: "POST",
        body: { action: "create", kind: "expense", name: "Phone bills", id: created },
      })
    ).status,
  ).toBe(200);
  for (const body of [
    { action: "rename", id: created, name: "Mobile" },
    { action: "archive", id: created },
    { action: "restore", id: created },
  ])
    expect((await app("/api/categories", { method: "POST", body })).status).toBe(200);
  const lists = await (await page.request.get("/api/categories")).json();
  expect(lists.expense.find((category: { id: string }) => category.id === created)).toEqual({
    id: created,
    kind: "expense",
    name: "Mobile",
    active: true,
  });
  await page.goto("/categories");
  await expect(
    page.getByRole("button", { name: "Archive Mobile", exact: true }),
  ).toBeVisible();
});

test("a cookie write must name this app's Origin, a bearer write needs none, and a foreign Origin is always refused", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const { bearer } = await nativeSignIn();
  const app = nativeClient(bearer);
  await moveClockTo("2026-09-11T18:00:00Z");
  const entry = () => ({
    id: randomUUID(),
    kind: "expense",
    amount: "1.00",
    date: "2026-09-10",
    categoryId: null,
    note: "",
  });
  const foreign = { Origin: "https://attacker.example" };
  const writes = [
    { path: "/api/journal", method: "POST", body: entry() },
    { path: "/api/journal", method: "PATCH", body: entry() },
    { path: "/api/journal", method: "DELETE", body: { id: randomUUID() } },
    {
      path: "/api/categories",
      method: "POST",
      body: { action: "create", kind: "expense", name: "Forged" },
    },
  ];
  for (const { path, method, body } of writes) {
    // The browser's cookie alone does not prove this app sent the write.
    await expectRefusal(
      await page.request.fetch(path, { method, data: body }),
      "request_not_allowed",
      403,
    );
    await expectRefusal(
      await page.request.fetch(path, { method, data: body, headers: foreign }),
      "request_not_allowed",
      403,
    );
    await expectRefusal(
      await app(path, { method, body, headers: foreign }),
      "request_not_allowed",
      403,
    );
  }
  // A foreign Origin is refused on reads too.
  await expectRefusal(
    await app("/api/journal", { headers: foreign }),
    "request_not_allowed",
    403,
  );
  // A bearer write still carries JSON.
  await expectRefusal(
    await app("/api/journal", {
      method: "POST",
      body: JSON.stringify(entry()),
      headers: { "Content-Type": "text/plain" },
    }),
    "request_not_allowed",
    403,
  );
  const untouched = await (await app("/api/journal")).json();
  expect(untouched.entries).toEqual([]);
  expect(JSON.stringify(await (await app("/api/categories")).json())).not.toContain("Forged");
  // A bearer write naming this app's own Origin is as good as one naming none.
  expect(
    (await app("/api/journal", { method: "POST", body: entry(), headers: { Origin: origin } }))
      .status,
  ).toBe(200);
});
