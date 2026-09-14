import { test, expect } from "@playwright/test";
import {
  connectSheets,
  createdSpreadsheets,
  entryRow,
  expectRefusal,
  forgetSpreadsheets,
  googleAnswers,
  moveClockTo,
  nativeClient,
  nativeSignIn,
  pdfText,
  resetClock,
  signIn,
  tabRows,
} from "./helpers";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async ({}, testInfo) => {
  // A native client has no viewport, so its requests are exercised once.
  test.skip(testInfo.project.name !== "desktop");
  await pool.query(
    "TRUNCATE spreadsheet_export, financial_movement, category, category_seed",
  );
  await googleAnswers();
  await forgetSpreadsheets();
});
test.afterAll(async () => {
  await pool.end();
  await googleAnswers();
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

for (const identity of ["unverified"] as const) {
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
  // The auth operations judge a presented token the same way: the cookie sent
  // with an invalid one neither reads nor ends its session.
  expect(
    await (
      await nativeClient(altered)("/api/auth/get-session", { headers: { Cookie: cookie! } })
    ).json(),
  ).toBeNull();
  await nativeClient(altered)("/api/auth/sign-out", {
    method: "POST",
    body: {},
    headers: { Cookie: cookie! },
  });
  expect(
    (await nativeClient()("/api/private", { headers: { Cookie: cookie! } })).status,
  ).toBe(200);
  expect((await nativeClient(bearer)("/api/private")).status).toBe(200);
});

test("native sign-in fails closed in a server without an auth secret", async () => {
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

test("signing out in the app ends that session alone, and a bearer session expires like a cookie", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const { bearer } = await nativeSignIn();
  const app = nativeClient(bearer);
  const session = await (await app("/api/auth/get-session")).json();
  expect(session.user.email).toBe("owner@example.test");
  // Ending a session still refuses a foreign Origin, and without a bearer token
  // a request naming no Origin cannot sign anyone out.
  await expectRefusal(
    await app("/api/auth/sign-out", {
      method: "POST",
      body: {},
      headers: { Origin: "https://attacker.example" },
    }),
    "request_not_allowed",
    403,
  );
  await expectRefusal(
    await nativeClient()("/api/auth/sign-out", { method: "POST", body: {} }),
    "request_not_allowed",
    403,
  );
  expect((await app("/api/private")).status).toBe(200);

  expect((await app("/api/auth/sign-out", { method: "POST", body: {} })).status).toBe(200);
  await expectRefusal(await app("/api/private"), "unauthenticated", 401);
  expect(await (await app("/api/auth/get-session")).json()).toBeNull();
  // The browser's own session is untouched.
  expect((await page.request.get("/api/private")).status()).toBe(200);

  // Auth operations the app does not use stay unreachable with a token too.
  const other = nativeClient((await nativeSignIn()).bearer);
  for (const path of [
    "/api/auth/list-sessions",
    "/api/auth/revoke-other-sessions",
    "/api/auth/update-user",
  ])
    await expectRefusal(await other(path, { method: "POST", body: {} }), "not_found", 404);
  expect((await other("/api/private")).status).toBe(200);
  // Seven days after it began, a bearer session no longer works.
  try {
    await moveClockTo(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString());
    await expectRefusal(await other("/api/private"), "unauthenticated", 401);
  } finally {
    await resetClock();
  }
});

test("a native client downloads the same PDF snapshot of a period as the web", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const app = nativeClient((await nativeSignIn()).bearer);
  await moveClockTo("2026-09-11T18:00:00Z");
  for (const body of [
    { kind: "income", amount: "4000", date: "2026-09-08", note: "Paid on Tuesday" },
    { kind: "expense", amount: "150.75", date: "2026-09-09", note: "Pharmacy" },
  ])
    expect(
      (
        await app("/api/journal", {
          method: "POST",
          body: { id: randomUUID(), categoryId: null, ...body },
        })
      ).status,
    ).toBe(200);
  const path = "/api/journal/export?kind=week&date=2026-09-11";
  const mine = await app(path);
  expect(mine.status).toBe(200);
  expect(mine.headers.get("content-type")).toBe("application/pdf");
  expect(mine.headers.get("cache-control")).toContain("no-store");
  expect(mine.headers.get("content-disposition")).toBe(
    'attachment; filename="finance-buddy-week-2026-09-07-to-2026-09-13-exported-2026-09-11.pdf"',
  );
  const bytes = Buffer.from(await mine.arrayBuffer());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const text = pdfText(bytes);
  expect(text).toContain("Total expenses (after refunds) MXN 150.75");
  expect(text).toContain("Pharmacy");
  // The web downloads exactly the same snapshot of the same period.
  const web = await page.request.get(path);
  expect(web.headers()["content-disposition"]).toBe(
    mine.headers.get("content-disposition"),
  );
  expect(pdfText(await web.body())).toBe(text);
  await expectRefusal(await app("/api/journal/export?kind=quarter"), "invalid_period", 400);
});

test("a native client exports to Google Sheets with the grant made on the web, which native sign-in never drops", async ({
  page,
}) => {
  const period = "/api/journal/spreadsheet?kind=week&date=2026-09-11";
  const exporting = (client: ReturnType<typeof nativeClient>, id = randomUUID()) =>
    client(period, { method: "POST", body: { id } });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const beforeGrant = nativeClient((await nativeSignIn()).bearer);
  await moveClockTo("2026-09-11T18:00:00Z");
  expect(
    (
      await beforeGrant("/api/journal", {
        method: "POST",
        body: {
          id: randomUUID(),
          kind: "expense",
          amount: "150.75",
          date: "2026-09-09",
          categoryId: null,
          note: "Pharmacy",
        },
      })
    ).status,
  ).toBe(200);
  // Without a grant the app is told to reconnect, which happens on the web.
  const refused = await exporting(beforeGrant);
  await expectRefusal(refused.clone(), "reconnect_required", 403);
  expect((await refused.json()).reconnect).toBe(true);
  expect(await createdSpreadsheets()).toHaveLength(0);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await page.getByRole("button", { name: "Export to Google Sheets" }).click();
  await connectSheets(page);
  await expect(page.getByText("Google Sheets export is connected")).toBeVisible();

  // Signing in natively after connecting keeps the web's grant.
  const later = await nativeSignIn();
  expect(later.response.status).toBe(200);
  const app = nativeClient(later.bearer);
  await moveClockTo("2026-09-11T18:00:00Z");
  const id = randomUUID();
  const created = await exporting(app, id);
  expect(created.status).toBe(200);
  const result = await created.json();
  const [spreadsheet] = await createdSpreadsheets();
  expect(result.url).toBe(
    `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
  );
  expect(
    tabRows(spreadsheet, "Summary").find(
      (row) => row[0]?.stringValue === "Total expenses",
    )![1],
  ).toEqual({ numberValue: 150.75 });
  // The same export repeated returns its own spreadsheet, not another one.
  const repeated = await exporting(app, id);
  expect(repeated.status).toBe(200);
  expect(await repeated.json()).toEqual(result);
  expect(await createdSpreadsheets()).toHaveLength(1);
  // The web keeps exporting without reconnecting.
  expect(
    (
      await page.request.post(period, {
        headers: { Origin: origin },
        data: { id: randomUUID() },
      })
    ).status(),
  ).toBe(200);
  expect(await createdSpreadsheets()).toHaveLength(2);

  // A reply that never arrives is never retried into a second spreadsheet.
  await googleAnswers("silent");
  const lost = randomUUID();
  await expectRefusal(await exporting(app, lost), "export_unconfirmed", 409);
  await googleAnswers();
  await expectRefusal(await exporting(app, lost), "export_unconfirmed", 409);
  await expectRefusal(
    await app(period, {
      method: "POST",
      body: { id: randomUUID() },
      headers: { Origin: "https://attacker.example" },
    }),
    "request_not_allowed",
    403,
  );
  expect(await createdSpreadsheets()).toHaveLength(2);
});
