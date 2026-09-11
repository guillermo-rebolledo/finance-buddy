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
        .setExpirationTime("1h")
        .sign(privateKey),
    ]),
  ),
);
agent
  .get("https://oauth2.googleapis.com")
  .intercept({ path: "/token", method: "POST" })
  .reply((options) => {
    const params = new URLSearchParams(String(options.body));
    const token = tokens[params.get("code")];
    if (
      !token ||
      !params.get("code_verifier") ||
      params.get("redirect_uri") !==
        "http://127.0.0.1:3100/api/auth/callback/google"
    )
      return { statusCode: 400, data: { error: "invalid_grant" } };
    return {
      statusCode: 200,
      data: {
        access_token: "controlled-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: token,
      },
    };
  })
  .persist();
agent
  .get("https://www.googleapis.com")
  .intercept({ path: "/oauth2/v3/certs" })
  .reply(200, { keys: [publicJwk] })
  .persist();

// Move only the server clock, at the external time boundary, to test natural expiry.
import { readFileSync } from "node:fs";
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
