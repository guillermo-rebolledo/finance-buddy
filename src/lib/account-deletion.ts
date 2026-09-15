import "server-only";
import { database } from "./database";
import { getConfig } from "./config";

type SignInAccount = {
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
};
type AppleCredentials = { client_id: string; client_secret: string };

async function postForm(url: string, fields: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Provider refused the request");
  return response;
}
function revokeApple(
  credentials: AppleCredentials,
  token: string,
  hint: string,
) {
  return postForm("https://appleid.apple.com/auth/revoke", {
    ...credentials,
    token,
    token_type_hint: hint,
  });
}

async function revokeAppleAccount(
  account: SignInAccount,
  code: string | undefined,
  proof: "bearer" | "cookie",
) {
  const apple = getConfig()?.apple;
  if (!apple) throw new Error("Apple is not configured");
  const web = {
    client_id: apple.clientId[0],
    client_secret: apple.clientSecret,
  };
  if (code) {
    // Authorization codes are opaque: the native bearer flow supplies a bundle
    // code; the cookie flow supplies a Services-ID code. Never try a different
    // audience after a failed exchange.
    const credentials =
      proof === "bearer"
        ? { client_id: apple.clientId[1], client_secret: apple.iosClientSecret }
        : web;
    if (!credentials.client_id || !credentials.client_secret)
      throw new Error("Apple code credentials are missing");
    const configured = {
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
    };
    const response = await postForm("https://appleid.apple.com/auth/token", {
      ...configured,
      code,
      grant_type: "authorization_code",
      ...(proof === "cookie"
        ? { redirect_uri: `${getConfig()!.origin}/api/auth/callback/apple` }
        : {}),
    });
    const tokens = await response.json();
    // This ID token came directly from Apple's HTTPS token endpoint, not from
    // the caller. Bind that code to this linked sign-in account before revoking.
    const claims = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1], "base64url").toString(),
    );
    if (
      claims.sub !== account.accountId ||
      claims.aud !== configured.client_id ||
      claims.iss !== "https://appleid.apple.com"
    )
      throw new Error("Apple code belongs to a different sign-in account");
    const token = tokens.refresh_token || tokens.access_token;
    if (typeof token !== "string" || !token)
      throw new Error("Apple returned no revocable token");
    await revokeApple(
      configured,
      token,
      tokens.refresh_token ? "refresh_token" : "access_token",
    );
  }
  // Tokens stored by the browser callback always belong to the Services ID.
  if (account.refreshToken)
    await revokeApple(web, account.refreshToken, "refresh_token");
  if (account.accessToken)
    await revokeApple(web, account.accessToken, "access_token");
}

export async function deleteUserIdentity(
  owner: string,
  code: string | undefined,
  proof: "bearer" | "cookie",
) {
  const { rows: accounts } = await database().query<SignInAccount>(
    'SELECT "accountId", "providerId", "accessToken", "refreshToken" FROM "account" WHERE "userId"=$1',
    [owner],
  );
  const appleAccounts = accounts.filter(
    (account) => account.providerId === "apple",
  );
  if (
    !code &&
    appleAccounts.some(
      (account) => !account.accessToken && !account.refreshToken,
    )
  )
    return "apple_authorization_required";
  try {
    for (const account of appleAccounts)
      await revokeAppleAccount(account, code, proof);
  } catch {
    return "apple_revocation_failed";
  }
  // Google grants (including drive.file) are best effort. Try each stored
  // token even when another fails; never log a token, code, or provider reply.
  for (const account of accounts.filter(
    (account) => account.providerId === "google",
  )) {
    for (const token of new Set([account.refreshToken, account.accessToken])) {
      if (!token) continue;
      try {
        await postForm("https://oauth2.googleapis.com/revoke", { token });
      } catch {
        console.warn("Google grant revocation failed during account deletion.");
      }
    }
  }
  // A single statement is one transaction, including every cascading delete.
  await database().query('DELETE FROM "user" WHERE id=$1', [owner]);
}
