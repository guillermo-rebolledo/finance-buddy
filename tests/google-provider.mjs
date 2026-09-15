// Test-only Node preload. Application code never imports this module.
import { MockAgent, setGlobalDispatcher } from "undici";
const db = new URL(process.env.DATABASE_URL || "https://invalid");
if (
  process.env.VERCEL ||
  db.hostname !== "127.0.0.1" ||
  db.pathname !== "/finance_buddy_test" ||
  !process.env.TEST_CLOCK_FILE
)
  throw new Error("Provider fixture requires the disposable test environment");
import { readFileSync } from "node:fs";
const agent = new MockAgent();
agent.disableNetConnect();
agent.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/);
setGlobalDispatcher(agent);
// Responses are selected by an authorization code supplied only by the browser fixture.
// Real callback parsing, state cookies, PKCE token exchange, identity checks and SQL run unchanged.
import { generateKeyPair, exportJWK, SignJWT } from "jose";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const publicJwk = {
  ...(await exportJWK(publicKey)),
  kid: "fixture",
  alg: "RS256",
  use: "sig",
};
const identities = {
  owner: {
    sub: "google-owner",
    email: "owner@example.test",
    email_verified: true,
  },
  stranger: {
    sub: "google-stranger",
    email: "stranger@example.test",
    email_verified: true,
  },
  unverified: {
    sub: "google-owner",
    email: "owner@example.test",
    email_verified: false,
  },
  changed: {
    sub: "google-owner",
    email: "stranger@example.test",
    email_verified: true,
  },
};
const tokens = Object.fromEntries(
  await Promise.all(
    Object.entries(identities).map(async ([code, claims]) => [
      code,
      await new SignJWT({ ...claims, name: "Test Owner" })
        .setProtectedHeader({ alg: "RS256", kid: "fixture" })
        .setIssuer("https://accounts.google.com")
        .setAudience("test-client")
        .setIssuedAt()
        .setExpirationTime("1d")
        .sign(privateKey),
    ]),
  ),
);
const appleTokens = Object.fromEntries(
  await Promise.all(
    Object.entries({
      ...identities,
      relay: { sub: "apple-relay", email: "hidden@privaterelay.appleid.com", email_verified: "true" },
    }).map(async ([code, claims]) => [
      code,
      await new SignJWT({ ...claims, sub: claims.sub.replace("google-", "apple-") })
        .setProtectedHeader({ alg: "RS256", kid: "fixture" })
        .setIssuer("https://appleid.apple.com")
        .setAudience("test-apple-service")
        .setIssuedAt()
        .setExpirationTime("1d")
        .sign(privateKey),
    ]),
  ),
);
import { installAppleProvider } from "./apple-provider.mjs";
await installAppleProvider(agent, appleTokens, privateKey);
// One control file names how Google answers next: an expired grant, a refused
// refresh, a revoked permission, exhausted quota, a provider failure, or a
// request that never gets a reply. Tests write it; the app never reads it.
import { appendFileSync, writeFileSync } from "node:fs";
const controlFile = process.env.TEST_CLOCK_FILE + ".google";
const captureFile = process.env.TEST_CLOCK_FILE + ".sheets";
function control() {
  try {
    return readFileSync(controlFile, "utf8").trim();
  } catch {
    return "";
  }
}
const exportScopes =
  "openid email profile https://www.googleapis.com/auth/drive.file";
agent
  .get("https://oauth2.googleapis.com")
  .intercept({ path: "/token", method: "POST" })
  .reply((options) => {
    const params = new URLSearchParams(String(options.body));
    if (params.get("grant_type") === "refresh_token") {
      if (
        control() === "refresh-failed" ||
        params.get("refresh_token") !== "controlled-refresh"
      )
        return { statusCode: 400, data: { error: "invalid_grant" } };
      return {
        statusCode: 200,
        data: {
          access_token: "refreshed-export-token",
          token_type: "Bearer",
          expires_in: control() === "expired" ? 1 : 3600,
          scope: exportScopes,
        },
      };
    }
    // The browser fixture appends ".drive" to the code when the authorization
    // URL asked for file access, so the granted scopes follow the real request.
    const [identity, grant] = String(params.get("code")).split(".");
    const token = tokens[identity];
    if (
      !token ||
      !params.get("code_verifier") ||
      params.get("redirect_uri") !==
        "http://127.0.0.1:3100/api/auth/callback/google"
    )
      return { statusCode: 400, data: { error: "invalid_grant" } };
    const exporting = grant === "drive";
    return {
      statusCode: 200,
      data: {
        access_token: exporting ? "controlled-export-token" : "controlled-token",
        token_type: "Bearer",
        // A short-lived export grant lets natural expiry drive a refresh.
        expires_in: exporting && control() === "expired" ? 1 : 3600,
        id_token: token,
        scope: exporting ? exportScopes : "openid email profile",
        ...(exporting ? { refresh_token: "controlled-refresh" } : {}),
      },
    };
  })
  .persist();
agent.get("https://oauth2.googleapis.com")
  .intercept({ path: "/revoke", method: "POST" })
  .reply((options) => {
    appendFileSync(process.env.TEST_CLOCK_FILE + ".google-revocations",
      JSON.stringify(Object.fromEntries(new URLSearchParams(String(options.body)))) + "\n");
    if (control() === "revoke-failed") return { statusCode: 500, data: {} };
    if (control() === "revoke-silent") throw new Error("socket hang up");
    return { statusCode: 200, data: {} };
  }).persist();
// Google Sheets at the same external boundary: every spreadsheet the app asks
// for is recorded whole, so tests compare what Google received with what the
// app reports on screen.
let spreadsheets = 0;
agent
  .get("https://sheets.googleapis.com")
  .intercept({ path: "/v4/spreadsheets", method: "POST" })
  .reply((options) => {
    const authorization =
      options.headers.authorization ?? options.headers.Authorization;
    if (!/^Bearer (controlled-export-token|refreshed-export-token)$/.test(authorization))
      return {
        statusCode: 401,
        data: { error: { code: 401, message: "Invalid Credentials" } },
      };
    const directive = control();
    if (directive === "revoked")
      return {
        statusCode: 401,
        data: { error: { code: 401, message: "Invalid Credentials" } },
      };
    if (directive === "quota")
      return {
        statusCode: 429,
        data: { error: { code: 429, message: "Quota exceeded" } },
      };
    if (directive === "failure")
      return {
        statusCode: 500,
        data: { error: { code: 500, message: "Internal error" } },
      };
    // No reply at all: the app cannot know whether a spreadsheet exists.
    if (directive === "silent") throw new Error("socket hang up");
    const spreadsheetId = `controlled-spreadsheet-${++spreadsheets}`;
    appendFileSync(
      captureFile,
      JSON.stringify({ spreadsheetId, request: JSON.parse(String(options.body)) }) + "\n",
    );
    return {
      statusCode: 200,
      data: {
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      },
    };
  })
  .persist();
writeFileSync(captureFile, "");
// Tests sign the ID tokens a native client presents with keys of their own,
// published here beside the fixture key exactly as Google publishes its keys.
const nativeKeysFile = process.env.TEST_CLOCK_FILE + ".jwks";
function nativeKeys() {
  try {
    return readFileSync(nativeKeysFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
agent
  .get("https://appleid.apple.com")
  .intercept({ path: "/auth/keys" })
  .reply(() => ({ statusCode: 200, data: { keys: [publicJwk, ...nativeKeys()] } }))
  .persist();
agent
  .get("https://www.googleapis.com")
  .intercept({ path: "/oauth2/v3/certs" })
  .reply(() => ({
    statusCode: 200,
    data: { keys: [publicJwk, ...nativeKeys()] },
  }))
  .persist();

// Move only the server clock, at the external time boundary, to test natural expiry.
const RealDate = Date;
function offset() {
  try {
    return Number(readFileSync(process.env.TEST_CLOCK_FILE, "utf8")) || 0;
  } catch {
    return 0;
  }
}
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(RealDate.now() + offset());
  }
  static now() {
    return RealDate.now() + offset();
  }
  static UTC(...args) {
    return RealDate.UTC(...args);
  }
  static parse(value) {
    return RealDate.parse(value);
  }
};
