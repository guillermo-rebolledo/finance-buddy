import "server-only";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { Pool } from "pg";
import { getConfig } from "./config";
import { sheetsScope } from "./financial";

function isVerifiedUser(user: { email?: string; emailVerified?: boolean }) {
  return user.emailVerified === true && !!user.email?.trim();
}

function createAuth(config: NonNullable<ReturnType<typeof getConfig>>) {
  const trustedProviders = ["google", ...(config.apple ? ["apple"] : [])];
  return betterAuth({
    baseURL: config.origin,
    secret: config.secret,
    database: new Pool({
      connectionString: config.databaseURL,
      max: 5,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    }),
    trustedOrigins: [
      config.origin,
      ...(config.apple ? ["https://appleid.apple.com"] : []),
    ],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.googleClientIds,
        clientSecret: config.googleClientSecret,
        prompt: "select_account",
        requireEmailVerification: true,
      },
      ...(config.apple ? { apple: config.apple } : {}),
    },
    user: {
      validateUserInfo: ({ user, source }) => {
        if (
          source.method !== "oauth" ||
          !trustedProviders.includes(source.oauth?.providerId ?? "") ||
          !isVerifiedUser(user)
        ) {
          return {
            error: "access_denied",
            errorDescription: "This account can't open this journal.",
          };
        }
      },
    },
    // Providers with the same verified email share one user ID and journal.
    // Different emails keep separate accounts, including Apple relay addresses.
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders,
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
// A request presenting a bearer token is judged by that token alone: its
// cookies are set aside, so an invalid token never falls back to a session
// cookie sent with it.
export function presentedProof(headers: Headers) {
  if (!headers.has("authorization")) return headers;
  const bearerOnly = new Headers(headers);
  bearerOnly.delete("cookie");
  return bearerOnly;
}

// Export authorization is separate from sign-in: the session stays valid whether
// or not this scope was ever granted, and a refusal here only blocks exporting.
// The token is minted for this request and never leaves the server.
export async function exportAccess(headers: Headers) {
  const auth = getAuth();
  if (!auth) return { status: "unavailable" } as const;
  try {
    const proven = presentedProof(headers);
    const accounts = await auth.api.listUserAccounts({ headers: proven });
    const account = accounts.find(
      (candidate) =>
        candidate.providerId === "google" &&
        candidate.scopes.includes(sheetsScope),
    );
    if (!account) return { status: "unauthorized" } as const;
    const token = await auth.api.getAccessToken({
      headers: proven,
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
    // Cookie caching is disabled: each request proves a live database-backed
    // session, from its bearer token when it presents one.
    const proof = headers.has("authorization") ? "bearer" : "cookie";
    const session = await auth.api.getSession({
      headers: presentedProof(headers),
    });
    if (!session) return { status: "unauthenticated" } as const;
    if (!isVerifiedUser(session.user)) return { status: "forbidden" } as const;
    return { status: "authorized", userId: session.user.id, proof } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}
