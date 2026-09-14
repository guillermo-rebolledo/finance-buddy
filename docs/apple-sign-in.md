# Sign in with Apple setup

Apple is an optional second provider. Google configuration remains required for the existing sign-in and Google Sheets export. Set both `APPLE_CLIENT_ID` and `APPLE_CLIENT_SECRET` to show **Sign in with Apple**; an absent or incomplete pair leaves Google available and Apple disabled. All variables are server-only, with no `NEXT_PUBLIC_` prefix.

## Apple Developer setup

Use an Apple Developer Program account with access to Certificates, Identifiers & Profiles:

1. Register or select an App ID, enable **Sign in with Apple**, and configure it as the primary App ID.
2. Register a **Services ID** for the website, such as `com.example.financebuddy.web`. Enable Sign in with Apple on it and select that primary App ID.
3. In its web configuration, add each domain and its exact return URL from the table below. Save the configuration. A Services ID is distinct from the native app's bundle ID.
4. Create a **Sign in with Apple** key associated with the primary App ID. Download its `.p8` file and store it outside this repository. Record the Key ID and your Apple Developer Team ID.

| Environment            | Domain example (no scheme/path) | Return URL example                                        |
| ---------------------- | ------------------------------- | --------------------------------------------------------- |
| Local via HTTPS tunnel | `finance-dev.example.com`       | `https://finance-dev.example.com/api/auth/callback/apple` |
| Production             | `finance.example.com`           | `https://finance.example.com/api/auth/callback/apple`     |

The return URL must equal `BETTER_AUTH_URL` plus `/api/auth/callback/apple`. Apple disallows localhost, IP addresses, and HTTP return URLs. See [Apple's web configuration guide](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/) and [redirect requirements](https://developer.apple.com/documentation/signinwithapple/configuring-your-webpage-for-sign-in-with-apple).

## Generate the client secret

`APPLE_CLIENT_SECRET` is a signed JWT, **not** the contents of the `.p8` file, your Apple password, or an app-specific password. The repository provides a local generator using the existing `jose` development dependency:

```sh
APPLE_CLIENT_ID=com.example.financebuddy.web \
APPLE_TEAM_ID=YOUR_TEAM_ID \
APPLE_KEY_ID=YOUR_KEY_ID \
APPLE_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_YOUR_KEY_ID.p8 \
pnpm --silent auth:apple-secret
```

Copy the emitted JWT into `APPLE_CLIENT_SECRET`. The expiration is printed separately to stderr. These three generator inputs (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_PATH`) are needed only on the machine generating the JWT; Vercel does not need them or the private key.

The JWT lasts 180 days. Set a reminder to regenerate it before expiration, replace it in every environment using that Services ID, and redeploy/restart. An expired or revoked credential stops new Apple browser sign-ins. Generate a separate JWT for each distinct Services ID. See [Better Auth's Apple credential documentation](https://better-auth.com/docs/authentication/apple).

## Local environment

Keep the existing six required values in `.env.local` (`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PRIVATE_OWNER_EMAIL`). For Apple, use:

```dotenv
BETTER_AUTH_URL=https://finance-dev.example.com
APPLE_CLIENT_ID=com.example.financebuddy.web
APPLE_CLIENT_SECRET=PASTE_GENERATED_JWT
# Optional, only for native Apple ID-token sign-in:
APPLE_IOS_BUNDLE_ID=com.example.financebuddy
```

1. Set up an HTTPS tunnel with a stable domain forwarding to `http://localhost:3000`. Register its hostname and Apple return URL above.
2. Register the same HTTPS origin and `https://finance-dev.example.com/api/auth/callback/google` in the Google OAuth web client so Google and Sheets authorization still work through the tunnel.
3. Run `pnpm dev:local`. Open **the HTTPS tunnel URL** in your browser for the entire login flow. Cookies belong to that hostname; switching back to localhost uses a different session.
4. If the tunnel hostname changes, update `BETTER_AUTH_URL`, both providers' callback registrations, and restart the app.

For ordinary Google-only localhost development, keep `BETTER_AUTH_URL=http://localhost:3000` and leave the Apple variables empty. Optional variables do not block `pnpm dev:local`.

## Production environment (Vercel)

In Vercel → Project → Settings → Environment Variables, select **Production** and set:

| Variable              | Production value                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`     | The stable public HTTPS origin, e.g. `https://finance.example.com`, without a trailing slash |
| `APPLE_CLIENT_ID`     | The Services ID registered for this website                                                  |
| `APPLE_CLIENT_SECRET` | The JWT generated for that Services ID                                                       |
| `APPLE_IOS_BUNDLE_ID` | Optional: the native iOS app's bundle ID                                                     |

Retain the existing production `DATABASE_URL`, `BETTER_AUTH_SECRET`, Google client credentials, and `PRIVATE_OWNER_EMAIL`. Use a separate local database and auth secret. Register the production hostname and exact Apple callback in Apple Developer, then redeploy; environment changes do not update an existing deployment. No new database migration is required.

For Preview, configure the variables separately, use an isolated database/secret and a stable HTTPS preview domain, and register its exact callbacks with Apple and Google. Random deployment URLs will not match registered return URLs.

## Owner identity and Google Sheets

The Apple account must share a **verified email exactly matching `PRIVATE_OWNER_EMAIL`** (case-insensitive). Choose **Share My Email**. Hide My Email supplies a different relay address, which this private workspace refuses. An Apple account using a different address is also refused. Do not change the owner setting to a relay address to work around this: that would deny your existing Google account and would not transfer its journal.

Signing in through either provider with the same verified owner email links to the same stable user ID, journal, categories, and sessions. Google Sheets still needs the owner's Google authorization: after signing in with Apple, use **Connect Google Sheets export** on the dashboard when prompted. Apple grants no Google file permissions.

## Native iOS backend contract

Set `APPLE_IOS_BUNDLE_ID` to accept ID tokens issued to the native app as well as the web Services ID. Enable Sign in with Apple in that app's signing capabilities and associate its primary App ID with the Services ID above. This repository adds backend support; the native app must implement its Apple authorization UI separately.

Generate a fresh random nonce for each authorization. Set the Apple request's nonce to its SHA-256 hex digest, then send the original nonce with Apple's identity token:

```json
{
  "provider": "apple",
  "idToken": {
    "token": "APPLE_IDENTITY_TOKEN",
    "nonce": "ORIGINAL_RANDOM_NONCE"
  }
}
```

POST to `/api/auth/sign-in/social` without an Origin header. Better Auth validates the issuer, signature, audience, expiry, and nonce. The app requires a nonce. Store the signed `set-auth-token` response header in Keychain and send it as `Authorization: Bearer <value>`, exactly as for Google. Without the optional bundle ID, native bundle audiences are refused. The browser flow continues using the Services ID.

## Verify real configuration

On both the local HTTPS origin and production: sign in with Apple and Share My Email, reload, confirm the existing journal is visible, sign out, sign in with Google, and confirm the same records. Try a different Apple account and confirm denial. Cancel an Apple authorization and confirm the login page offers retry. Check Google Sheets authorization/export from an Apple session. If using iOS, test a real device and verify sign-out revokes its bearer session.

Automated tests control Apple's HTTP responses and exercise real callback/state handling and database sessions. They do not validate your Apple Developer registration, real credentials, tunnel, or Vercel settings.
