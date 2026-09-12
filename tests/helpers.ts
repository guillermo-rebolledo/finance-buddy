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
      // The same browser flow serves sign-in and export authorization. A code
      // marked ".drive" is returned only when Google was actually asked for
      // file access, offline, with the owner's consent.
      const exporting = url.searchParams
        .get("scope")!
        .includes("https://www.googleapis.com/auth/drive.file");
      if (exporting) {
        expect(url.searchParams.get("access_type")).toBe("offline");
        expect(url.searchParams.get("prompt")).toBe("consent");
      }
      callback.searchParams.set("code", exporting ? `${identity}.drive` : identity);
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

// Google's answers are controlled at the same external boundary as its tokens:
// "revoked", "expired", "refresh-failed", "quota", "failure", "silent", or
// nothing at all for an ordinary success.
export async function googleAnswers(directive = "") {
  await writeFile(process.env.TEST_CLOCK_FILE! + ".google", directive);
}
// Each case observes only the spreadsheets it caused.
export async function forgetSpreadsheets() {
  await writeFile(process.env.TEST_CLOCK_FILE! + ".sheets", "");
}
// Every spreadsheet Google was actually asked to create, in order, exactly as
// the app sent it.
type Cell = { userEnteredValue: Record<string, unknown> };
type CapturedSpreadsheet = {
  spreadsheetId: string;
  request: {
    properties: { title: string };
    sheets: {
      properties: { title: string };
      data: { rowData: { values?: Cell[] }[] }[];
    }[];
  };
};
export async function createdSpreadsheets(): Promise<CapturedSpreadsheet[]> {
  const captured = await readFile(
    process.env.TEST_CLOCK_FILE! + ".sheets",
    "utf8",
  ).catch(() => "");
  return captured
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
// One spreadsheet tab as plain rows of cell values, so a test compares what
// Google received with what the app reports.
export function tabRows(spreadsheet: CapturedSpreadsheet, title: string) {
  const sheet = spreadsheet.request.sheets.find(
    (candidate) => candidate.properties.title === title,
  )!;
  return sheet.data[0].rowData.map((row) =>
    (row.values ?? []).map((cell) => cell.userEnteredValue),
  );
}
// Authorizes, or deliberately refuses, the extra Google file access an export
// needs, through the app's own control.
export async function connectSheets(
  page: import("@playwright/test").Page,
  { deny = false } = {},
) {
  if (deny)
    await page.route(
      "https://accounts.google.com/o/oauth2/v2/auth**",
      async (route) => {
        const url = new URL(route.request().url());
        const callback = new URL(url.searchParams.get("redirect_uri")!);
        callback.searchParams.set("state", url.searchParams.get("state")!);
        callback.searchParams.set("error", "access_denied");
        await route.fulfill({
          status: 302,
          headers: { location: callback.toString() },
        });
      },
    );
  await page
    .getByRole("button", { name: "Connect Google Sheets export" })
    .click();
}
