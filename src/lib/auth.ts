import "server-only";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { Pool } from "pg";
import { getConfig } from "./config";
import { sheetsScope } from "./financial";

function isVerifiedOwner(
  user: { email?: string; emailVerified?: boolean },
  ownerEmail: string,
) {
  return (
    user.emailVerified === true && user.email?.toLowerCase() === ownerEmail
  );
}

function createAuth(config: NonNullable<ReturnType<typeof getConfig>>) {
  return betterAuth({
    baseURL: config.origin,
    secret: config.secret,
    database: new Pool({
      connectionString: config.databaseURL,
      max: 5,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    }),
    trustedOrigins: [config.origin],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.googleClientIds,
        clientSecret: config.googleClientSecret,
        prompt: "select_account",
        requireEmailVerification: true,
      },
    },
    user: {
      validateUserInfo: ({ user, source }) => {
        if (
          source.method !== "oauth" ||
          source.oauth?.providerId !== "google" ||
          !isVerifiedOwner(user, config.ownerEmail)
        ) {
          return {
            error: "access_denied",
            errorDescription: "This account cannot access this workspace.",
          };
        }
      },
    },
    // Linking exists for one purpose: the same Google identity granting the
    // extra file access an export needs. Different emails stay refused, so the
    // only account that can ever be linked is the owner's own.
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        allowDifferentEmails: false,
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    // The iOS app presents its session as a bearer token. Only the signed form
    // is accepted, so the raw token stored in a session row is not enough.
    plugins: [bearer({ requireSignature: true })],
    onAPIError: { errorURL: `${config.origin}/login`, throw: false },
    logger: { disabled: true },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  const config = getConfig();
  if (!config) return null;
  return (instance ??= createAuth(config));
}

// Export authorization is separate from sign-in: the session stays valid whether
// or not this scope was ever granted, and a refusal here only blocks exporting.
// The token is minted for this request and never leaves the server.
export async function exportAccess(headers: Headers) {
  const auth = getAuth();
  if (!auth) return { status: "unavailable" } as const;
  try {
    const accounts = await auth.api.listUserAccounts({ headers });
    const account = accounts.find(
      (candidate) =>
        candidate.providerId === "google" &&
        candidate.scopes.includes(sheetsScope),
    );
    if (!account) return { status: "unauthorized" } as const;
    const token = await auth.api.getAccessToken({
      headers,
      body: { accountId: account.id },
    });
    // A refused refresh, a revoked grant and a dropped scope all read the same
    // way to the owner: reconnect before exporting again.
    if (!token.accessToken || !token.scopes?.includes(sheetsScope))
      return { status: "unauthorized" } as const;
    return { status: "authorized", accessToken: token.accessToken } as const;
  } catch {
    return { status: "unauthorized" } as const;
  }
}

export async function getAccess(headers: Headers) {
  const config = getConfig();
  const auth = getAuth();
  if (!config || !auth) return { status: "unavailable" } as const;
  try {
    // A request presenting a bearer token is judged by that token alone: its
    // cookies are set aside, so an invalid token never falls back to a session
    // cookie sent with it. Whichever proof it is, cookie caching is disabled,
    // so each request proves a live database-backed session.
    const proof = headers.has("authorization") ? "bearer" : "cookie";
    const presented = new Headers(headers);
    if (proof === "bearer") presented.delete("cookie");
    const session = await auth.api.getSession({ headers: presented });
    if (!session) return { status: "unauthenticated" } as const;
    if (!isVerifiedOwner(session.user, config.ownerEmail))
      return { status: "forbidden" } as const;
    return { status: "authorized", userId: session.user.id, proof } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}
