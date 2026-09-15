// Installed only by the guarded disposable-environment provider preload.
import { appendFileSync, readFileSync } from "node:fs";
import { SignJWT } from "jose";

export async function installAppleProvider(agent, webTokens, privateKey) {
  const file = process.env.TEST_CLOCK_FILE;
  function control() {
    try {
      return readFileSync(file + ".apple", "utf8").trim();
    } catch {
      return "";
    }
  }
  function capture(path, params) {
    appendFileSync(
      file + ".apple-requests",
      JSON.stringify({ path, ...Object.fromEntries(params) }) + "\n",
    );
  }
  const deletionTokens = {};
  for (const [code, audience, subject] of [
    ["delete-native", "test-apple-ios", "apple-owner"],
    ["delete-web", "test-apple-service", "apple-owner"],
    ["delete-stranger", "test-apple-ios", "apple-stranger"],
  ]) {
    deletionTokens[code] = await new SignJWT({ sub: subject })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setIssuer("https://appleid.apple.com")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(privateKey);
  }
  agent
    .get("https://appleid.apple.com")
    .intercept({ path: "/auth/token", method: "POST" })
    .reply((options) => {
      const params = new URLSearchParams(String(options.body));
      const code = params.get("code");
      if (code?.startsWith("delete-")) {
        capture("/auth/token", params);
        const native = code !== "delete-web";
        if (
          control() === "exchange-failed" ||
          !deletionTokens[code] ||
          params.get("grant_type") !== "authorization_code" ||
          params.get("client_id") !==
            (native ? "test-apple-ios" : "test-apple-service") ||
          params.get("client_secret") !==
            (native ? "test-apple-ios-secret" : "test-apple-secret") ||
          (native
            ? params.has("redirect_uri")
            : params.get("redirect_uri") !==
              "http://127.0.0.1:3100/api/auth/callback/apple")
        )
          return { statusCode: 400, data: { error: "invalid_grant" } };
        if (control() === "exchange-silent") throw new Error("socket hang up");
        if (control() === "no-token") return { statusCode: 200, data: {} };
        return {
          statusCode: 200,
          data: {
            access_token: `access-${code}`,
            refresh_token: `refresh-${code}`,
            id_token: deletionTokens[code],
            token_type: "Bearer",
            expires_in: 3600,
          },
        };
      }
      const token = webTokens[code];
      if (
        !token ||
        params.get("client_id") !== "test-apple-service" ||
        params.get("client_secret") !== "test-apple-secret" ||
        params.get("redirect_uri") !==
          "http://127.0.0.1:3100/api/auth/callback/apple"
      )
        return { statusCode: 400, data: { error: "invalid_grant" } };
      return {
        statusCode: 200,
        data: {
          access_token: "controlled-apple-token",
          token_type: "Bearer",
          ...(control() === "web-refresh"
            ? { refresh_token: "controlled-apple-refresh" }
            : {}),
          expires_in: 3600,
          id_token: token,
        },
      };
    })
    .persist();
  agent
    .get("https://appleid.apple.com")
    .intercept({ path: "/auth/revoke", method: "POST" })
    .reply((options) => {
      const params = new URLSearchParams(String(options.body));
      capture("/auth/revoke", params);
      const token = params.get("token") ?? "";
      const native =
        token.includes("delete-native") || token.includes("delete-stranger");
      if (
        control() === "revoke-failed" ||
        (control() === "stored-revoke-failed" &&
          token.startsWith("controlled-")) ||
        params.get("client_id") !==
          (native ? "test-apple-ios" : "test-apple-service") ||
        params.get("client_secret") !==
          (native ? "test-apple-ios-secret" : "test-apple-secret") ||
        params.get("token_type_hint") !==
          (token.includes("refresh") ? "refresh_token" : "access_token")
      )
        return { statusCode: 400, data: { error: "invalid_client" } };
      if (control() === "revoke-silent") throw new Error("socket hang up");
      return { statusCode: 200, data: "" };
    })
    .persist();
}
