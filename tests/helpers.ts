import { readFile, writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
export async function signIn(
  page: import("@playwright/test").Page,
  identity = "owner",
) {
  const previous = Number(
    await readFile(process.env.TEST_CLOCK_FILE!, "utf8").catch(() => "0"),
  );
  // Restore an advancing real-time clock before OAuth; tests may rewind reporting time afterward.
  const lastSignin = Number(
    await readFile(process.env.TEST_CLOCK_FILE! + ".signin", "utf8").catch(
      () => "0",
    ),
  );
  const signinClock = Math.max(previous, lastSignin, 0) + 61000;
  await writeFile(
    process.env.TEST_CLOCK_FILE! + ".signin",
    String(signinClock),
  );
  await writeFile(process.env.TEST_CLOCK_FILE!, String(signinClock));
  await page.route(
    "https://accounts.google.com/o/oauth2/v2/auth**",
    async (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      const callback = new URL(url.searchParams.get("redirect_uri")!);
      callback.searchParams.set("state", url.searchParams.get("state")!);
      callback.searchParams.set("code", identity);
      await route.fulfill({
        status: 302,
        headers: { location: callback.toString() },
      });
    },
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
}

// The server clock is the only clock a summary may depend on, so tests move it
// explicitly instead of relying on the machine's own date.
export async function moveClockTo(instant: string) {
  await writeFile(
    process.env.TEST_CLOCK_FILE!,
    String(Date.parse(instant) - Date.now()),
  );
}
export async function resetClock() {
  await writeFile(process.env.TEST_CLOCK_FILE!, "0");
}
