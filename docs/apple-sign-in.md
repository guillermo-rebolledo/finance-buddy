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

## Generate and renew the bundle-ID secret

Native authorization codes are issued to the app's bundle ID. A JWT for the web Services ID cannot exchange or revoke their tokens. Run the same generator with the **bundle ID as its subject**:

```sh
APPLE_CLIENT_ID=com.example.financebuddy \
APPLE_TEAM_ID=YOUR_TEAM_ID \
APPLE_KEY_ID=YOUR_KEY_ID \
APPLE_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_YOUR_KEY_ID.p8 \
pnpm --silent auth:apple-secret
```

Here `APPLE_CLIENT_ID` is only the generator's input for this command. Keep the deployed `APPLE_CLIENT_ID` set to the **web Services ID**. Store this new JWT in `APPLE_IOS_CLIENT_SECRET`, alongside `APPLE_IOS_BUNDLE_ID=com.example.financebuddy`, and keep the original web JWT in `APPLE_CLIENT_SECRET`.

Both JWTs expire after 180 days. Record both expiration dates, regenerate each with its own subject before expiry, replace the values in every environment that uses them, and restart/redeploy. The private `.p8` key stays on the generation machine. Without the bundle-ID secret, native ID-token sign-in still works, but account deletion with a native authorization code returns `apple_revocation_failed` and keeps all local records. The setting is ignored without `APPLE_IOS_BUNDLE_ID`.

## Local environment

Keep the existing five required values in `.env.local` (`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). For Apple, use:

```dotenv
BETTER_AUTH_URL=https://finance-dev.example.com
APPLE_CLIENT_ID=com.example.financebuddy.web
APPLE_CLIENT_SECRET=PASTE_GENERATED_JWT
# Optional, only for native Apple ID-token sign-in:
APPLE_IOS_BUNDLE_ID=com.example.financebuddy
# Required when deleting with a native Apple authorization code:
APPLE_IOS_CLIENT_SECRET=PASTE_BUNDLE_ID_JWT
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
| `APPLE_IOS_CLIENT_SECRET` | JWT generated with that bundle ID as its subject; required for native Apple code exchange during deletion |

Retain the existing production `DATABASE_URL`, `BETTER_AUTH_SECRET`, and Google client credentials. Use a separate local database and auth secret. Register the production hostname and exact Apple callback in Apple Developer, then redeploy; environment changes do not update an existing deployment. No new database migration is required.

For Preview, configure the variables separately, use an isolated database/secret and a stable HTTPS preview domain, and register its exact callbacks with Apple and Google. Random deployment URLs will not match registered return URLs.

## Account identity and Google Sheets

Any Apple account with a verified email can sign in. **Hide My Email is supported** and creates a separate account for its relay address. `PRIVATE_OWNER_EMAIL` is ignored and can be removed from local and production environments after deploying the updated code.

Signing in through either provider with the same verified email links to the same stable user ID, journal, and categories. To open an existing Google journal with Apple, choose **Share My Email** and use the same email as Google. Different emails are not linked, and existing journals are not transferred.

Google Sheets still needs Google authorization: after signing in with Apple, use **Connect Google Sheets export** on the dashboard when prompted. The linked Google account must have the same verified email. An Apple relay account can use its journal and PDF exports, but cannot link a Google account with a different email for Sheets exports. Apple grants no Google file permissions.

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

## Delete an Apple-linked user identity

The native app obtains a fresh Apple authorization code for the same Apple sign-in account, then sends `DELETE /api/account` with its signed bearer session, `Content-Type: application/json`, and `{ "appleAuthorizationCode": "FRESH_CODE" }`. A code supplied with a bearer request is exchanged using the bundle ID and its secret. Cookie requests use the Services ID and its secret, with the registered callback URL. Do not reuse the code already consumed by a sign-in callback.

A request may omit the code when the backend already holds a web refresh or access token. If none is stored, the endpoint returns `apple_authorization_required`. It revokes the code's resulting token and any stored web tokens; an exchange or revocation failure returns `apple_revocation_failed` without deleting local records. On `204`, discard the local session and cached journal. All other sessions for that identity are invalid too. A later sign-in starts a new empty journal with starter categories. Previously exported Google Drive spreadsheets remain in Drive.

See [Apple's account-deletion guidance](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple) and [token revocation endpoint](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens).

## Verify real configuration

On both the local HTTPS origin and production: sign in with Apple and Share My Email, reload, confirm the existing journal is visible, sign out, sign in with Google, and confirm the same records. Try a different verified Apple account and Hide My Email; confirm each opens its own journal without exposing the first account's records. Cancel an Apple authorization and confirm the login page offers retry. Check Google Sheets authorization/export from an Apple session. If using iOS, test a real device and verify sign-out revokes its bearer session.

Using a disposable test identity on a real device, delete with a fresh Apple code and verify `204`, old web and native sessions are refused, and a later sign-in has no financial movements. Repeat web deletion with a stored Apple token. Verify both client-secret subjects and renewal dates.

Automated tests control Apple's HTTP responses and exercise real callback/state handling and database sessions. They do not validate your Apple Developer registration, real credentials, tunnel, or Vercel settings.

### Deleting from web Settings

Settings has a separate **Delete account** confirmation. If the endpoint needs a fresh Apple code, the dialog loads [Apple's JavaScript authorization](https://developer.apple.com/documentation/signinwithapple/configuring-your-webpage-for-sign-in-with-apple) and offers **Authorize Apple and delete**. It uses the existing Services ID and registered `/api/auth/callback/apple` return URL in popup mode. The code goes directly to `DELETE /api/account`, so the sign-in callback does not consume it first or replace the current session. The returned state must match the authorization request.

The popup opens from the person's click after the SDK has loaded. Cancellation, blocked popups, SDK loading failures, and API refusals leave Settings available for another attempt. Verify this with a disposable Apple-linked identity on the registered HTTPS origin, including one first created by native Apple sign-in with no stored web token. Automated browser tests control the Apple SDK response and token/revocation endpoints; real Apple credentials and registration still need that deployment check.
