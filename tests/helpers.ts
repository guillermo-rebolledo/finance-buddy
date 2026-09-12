import { inflateSync } from "node:zlib";
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
// A downloaded PDF is read the way a person reads it: the text actually drawn
// on its pages, in order. Content streams are compressed, so each one is
// inflated and its show-text operators are collected.
const winAnsi: Record<string, string> = {
  "\x80": "€",
  "\x91": "‘",
  "\x92": "’",
  "\x93": "“",
  "\x94": "”",
  "\x95": "•",
  "\x96": "–",
  "\x97": "—",
};
const escapes: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
};
function winAnsiText(text: string) {
  return text.replace(/[\x80-\x9f]/g, (character) => winAnsi[character] ?? "?");
}
export function pdfLines(file: Buffer) {
  const raw = file.toString("latin1");
  const lines: string[] = [];
  for (const stream of raw.matchAll(/stream\r?\n/g)) {
    const start = stream.index + stream[0].length;
    let body: Buffer;
    try {
      body = inflateSync(file.subarray(start, raw.indexOf("endstream", start)));
    } catch {
      continue;
    }
    // pdf-lib shows text as hex strings; literal strings are read too so the
    // reader does not depend on which form a writer chose.
    for (const [, literal, hex] of body
      .toString("latin1")
      .matchAll(/(?:\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]*)>)\s*Tj/gs))
      lines.push(
        winAnsiText(
          hex === undefined
            ? literal.replace(
                /\\([0-7]{1,3})|\\(.)/gs,
                (_, octal, character) =>
                  octal
                    ? String.fromCharCode(parseInt(octal, 8))
                    : (escapes[character] ?? character),
              )
            : Buffer.from(hex.replace(/\s+/g, ""), "hex").toString("latin1"),
        ),
      );
  }
  return lines;
}
// Wrapped text reads as one string, so a note or a long name can be searched
// for without knowing where its column broke it.
export function pdfText(file: Buffer) {
  return pdfLines(file).join(" ").replace(/\s+/g, " ");
}
// Choices are listboxes rather than native selects, so a choice is made the way
// a person makes it: open the list by its label, then pick an option by name.
export async function choose(
  page: import("@playwright/test").Page,
  label: string,
  option: string,
) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}
// The options a list offers, in order, read from the open list and closed again
// without changing the choice.
export async function optionsOf(
  page: import("@playwright/test").Page,
  label: string,
) {
  await page.getByLabel(label, { exact: true }).click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const names = await options.allTextContents();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  return names;
}

// On a phone the sections live in the navigation drawer, which the top bar
// shows and hides; on desktop they are already on screen.
export async function openNavigation(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
) {
  await expect(async () => {
    if (await target.isVisible()) return;
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(target).toBeVisible({ timeout: 1000 });
  }).toPass();
}
export async function goToSection(
  page: import("@playwright/test").Page,
  name: string,
) {
  const link = page.getByRole("link", { name, exact: true });
  await openNavigation(page, link);
  await link.click();
}
