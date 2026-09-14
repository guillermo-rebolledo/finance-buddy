import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  advanceSignInClock,
  appleIdToken,
  appleSignIn,
  appOrigin,
  nativeClient,
  nativeSignIn,
  signIn,
} from "./helpers";

test("different verified emails get independent journals and cannot change each other's entries", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const firstUser = await (await page.request.get("/api/private")).json();
  const report = await (await page.request.get("/api/journal")).json();
  const entry = {
    id: randomUUID(),
    kind: "expense",
    amount: "89.12",
    date: report.today,
    categoryId: null,
    note: `Private entry ${randomUUID()}`,
  };
  expect(
    (
      await page.request.post("/api/journal", {
        headers: { Origin: appOrigin },
        data: entry,
      })
    ).status(),
  ).toBe(200);

  const other = await browser.newContext({ baseURL: appOrigin });
  try {
    const secondPage = await other.newPage();
    await signIn(secondPage, "stranger");
    await expect(
      secondPage.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const secondUser = await (await other.request.get("/api/private")).json();
    expect(secondUser.userId).not.toBe(firstUser.userId);
    const secondReport = await (await other.request.get("/api/journal")).json();
    expect(secondReport.entries).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: entry.id })]),
    );
    expect(
      secondReport.categories.map((category: { id: string }) => category.id),
    ).not.toEqual(expect.arrayContaining([report.categories[0].id]));
    expect(
      (
        await other.request.patch("/api/journal", {
          headers: { Origin: appOrigin },
          data: { ...entry, amount: "1.00" },
        })
      ).ok(),
    ).toBe(false);
    await other.request.delete("/api/journal", {
      headers: { Origin: appOrigin },
      data: { id: entry.id },
    });
    const unchanged = await (await page.request.get("/api/journal")).json();
    expect(unchanged.entries).toEqual(
      expect.arrayContaining([expect.objectContaining(entry)]),
    );
    const secondEntry = {
      ...entry,
      id: randomUUID(),
      note: "Second user's entry",
    };
    expect(
      (
        await other.request.post("/api/journal", {
          headers: { Origin: appOrigin },
          data: secondEntry,
        })
      ).status(),
    ).toBe(200);
    await secondPage.reload();
    expect(
      (await (await other.request.get("/api/journal")).json()).entries,
    ).toEqual(expect.arrayContaining([expect.objectContaining(secondEntry)]));
    expect(
      (await (await page.request.get("/api/journal")).json()).entries,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: secondEntry.id })]),
    );
    await other.request.delete("/api/journal", {
      headers: { Origin: appOrigin },
      data: { id: secondEntry.id },
    });
    await page.request.post("/api/auth/revoke-sessions", {
      headers: { Origin: appOrigin },
      data: {},
    });
    expect((await page.request.get("/api/private")).status()).toBe(401);
    expect((await other.request.get("/api/private")).status()).toBe(200);
  } finally {
    await other.close();
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    await page.request.delete("/api/journal", {
      headers: { Origin: appOrigin },
      data: { id: entry.id },
    });
  }
});

for (const identity of ["stranger", "relay"]) {
  test(`Apple ${identity} signs in and retains a separate account`, async ({
    page,
  }) => {
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const original = await (await page.request.get("/api/private")).json();
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: appOrigin },
      data: {},
    });
    await appleSignIn(page, identity);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const first = await (await page.request.get("/api/private")).json();
    expect(first.userId).not.toBe(original.userId);
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: appOrigin },
      data: {},
    });
    await appleSignIn(page, identity);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    expect(await (await page.request.get("/api/private")).json()).toEqual(
      first,
    );
  });
}

test("native providers accept another verified email, while email changes retain the original account", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  const original = await (await page.request.get("/api/private")).json();
  const second = await nativeSignIn({ identity: "stranger" });
  expect(second.response.status).toBe(200);
  const secondUser = await (
    await nativeClient(second.bearer)("/api/private")
  ).json();
  expect(secondUser.userId).not.toBe(original.userId);
  const changed = await nativeSignIn({ identity: "changed" });
  expect(changed.response.status).toBe(200);
  expect(
    await (await nativeClient(changed.bearer)("/api/private")).json(),
  ).toEqual(original);
  for (const identity of ["owner", "stranger", "changed"] as const) {
    await advanceSignInClock();
    const nonce = randomUUID();
    const token = await appleIdToken({ identity, nonce });
    const response = await nativeClient()("/api/auth/sign-in/social", {
      method: "POST",
      body: { provider: "apple", idToken: { token, nonce } },
    });
    expect(response.status).toBe(200);
    expect(
      await (
        await nativeClient(response.headers.get("set-auth-token"))(
          "/api/private",
        )
      ).json(),
    ).toEqual(identity === "stranger" ? secondUser : original);
  }
});

for (const provider of ["google", "apple"]) {
  test(`${provider} email changes keep the existing journal owner`, async ({
    page,
  }) => {
    const login = provider === "google" ? signIn : appleSignIn;
    await login(page);
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    const original = await (await page.request.get("/api/private")).json();
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: appOrigin },
      data: {},
    });
    await login(page, "stranger");
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/private")).json()).userId,
    ).not.toBe(original.userId);
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: appOrigin },
      data: {},
    });
    await login(page, "changed");
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    expect(await (await page.request.get("/api/private")).json()).toEqual(
      original,
    );
  });
}
