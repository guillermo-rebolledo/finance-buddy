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
