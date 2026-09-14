# Finance Buddy

A private personal finance journal. It records income, expenses, and refunds in MXN, with optional categories and notes, exact totals, and Mexico City movement dates.

Three signed-in pages share one period selection. The home page is the **entry registry**: the selected day, week, or month as a compact list of movements, with recording, correcting, and deleting. **Dashboard** carries the figures: that period's totals and spending by category, trend charts across the periods leading up to it, and both snapshot exports. **Categories** manages the income and expense lists. See `docs/adr/0006-separate-the-dashboard-from-the-entry-registry.md`.

## Tooling

Use Node **24.20.0** (`.node-version`) and pnpm **10.29.2** (`packageManager`). Runtime dependencies are exact-pinned and `pnpm-lock.yaml` is committed. Next.js 16.3.5, React 19.3.0, Better Auth 1.7.4, Tailwind CSS 4.3.3, and shadcn/ui Radix components are used. The vendored UI components were installed with shadcn CLI 4.21.0. Signed-in pages share one shadcn `Sidebar`: on desktop it collapses to icons (the state is remembered in a cookie, and Ctrl/⌘+B toggles it), and on a phone it opens as a sheet from the menu button in the top bar. Light, dark, and system modes use next-themes 0.4.6, and component animations use tw-animate-css 1.4.0. TypeScript 6.0.2 and ESLint 9.39.4 match the current Next ESLint plugin peer ranges.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

## Private configuration

Configure these five required variables plus the optional provider and iOS settings below; none are `NEXT_PUBLIC_`:

| Variable               | Value                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Neon PostgreSQL connection string with `sslmode=require`; use the pooled endpoint for the app.            |
| `BETTER_AUTH_URL`      | Exact origin, without a trailing slash. HTTPS for Vercel; `http://localhost:3000` for local development.  |
| `BETTER_AUTH_SECRET`   | Random secret of at least 32 characters; generate with `openssl rand -base64 48`.                         |
| `GOOGLE_CLIENT_ID`     | Google OAuth web client ID.                                                                               |
| `GOOGLE_CLIENT_SECRET` | Matching Google OAuth client secret.                                                                      |
| `GOOGLE_IOS_CLIENT_ID` | Optional. Google OAuth iOS client ID whose ID tokens native sign-in accepts beside the web client's.      |
| `APPLE_CLIENT_ID`     | Optional. Apple web Services ID; set together with `APPLE_CLIENT_SECRET`. |
| `APPLE_CLIENT_SECRET` | Optional. Generated Apple client-secret JWT; renew before its 180-day expiry. |
| `APPLE_IOS_BUNDLE_ID` | Optional. Additional audience for native Apple ID tokens, when Apple is configured. |
| `MINIMUM_IOS_BUILD`    | Optional. The oldest iOS app build served, such as `12`; older builds are asked to update.                |

For Apple Developer registration, the secret generator, HTTPS local testing, and production Vercel values, follow **[Sign in with Apple setup](docs/apple-sign-in.md)**. Apple is optional; configure both Apple credentials to enable its login button.

Create a Google OAuth **Web application** client, set the application origin, and register the exact callback `<BETTER_AUTH_URL>/api/auth/callback/google`. Local and deployment callbacks must be registered separately. When testing Google Sheets authorization, add the accounts using it as consent-screen test users if the Google project is in testing mode. Sign-in requests only basic identity scopes. Exporting additionally asks for `https://www.googleapis.com/auth/drive.file`, which reaches only the spreadsheets this app creates; enable the Google Sheets API and the Google Drive API on the same project and list that scope on the consent screen. No further environment variables are needed, and provider tokens stay server-side.

The iOS app signs in natively instead of following Google's redirect. Create an **iOS** OAuth client in the same Google Cloud project and set its client ID as `GOOGLE_IOS_CLIENT_ID`. The app obtains a Google ID token from Google Sign-In for iOS, passing a fresh nonce, and posts `{ provider: "google", idToken: { token, nonce } }` to `/api/auth/sign-in/social` without an Origin header; a sign-in without the nonce is refused before the token is verified. The token is verified against Google for either the web or the iOS client ID, and admission is exactly the web's. The session comes back in the `set-auth-token` response header, which the app keeps in the Keychain and sends as `Authorization: Bearer <value>`; the `token` in the reply body is unsigned and is not accepted as a bearer token. A request presenting a bearer token is judged by that token alone, never by a cookie sent with it, and browsers never receive `set-auth-token`. Without `GOOGLE_IOS_CLIENT_ID`, tokens issued to the iOS client are refused and web sign-in is unaffected.

Signing out in the app posts `{}` to `/api/auth/sign-out` with its bearer token and no Origin, which deletes that session alone; without a bearer token, a sign-out naming no Origin is refused. **Settings → Sessions → Sign out everywhere** asks for confirmation and then ends every session of the owner, this browser's and any phone's included, through `/api/auth/revoke-sessions`, the only auth operation added for it. Every other Better Auth operation stays unreachable, with or without a token.

Any verified Google or Apple email can sign in and create an account, including Apple Hide My Email relay addresses. Providers with the same verified email link to the same stable Better Auth `user.id`; different emails have separate journals. Existing accounts retain their user IDs and records. Every protected request revalidates the database session and verified email, and journal queries are scoped to that user ID. Session cookies are HTTP-only, same-site, secure on HTTPS, and are not used as a cache of authorization. Sessions expire after seven days, subject to Better Auth's rolling refresh, and sign-out deletes the session.

`PRIVATE_OWNER_EMAIL` is no longer used or required. Remove it from `.env.local` and Vercel when convenient; an existing value is ignored. Deploy this code to change production admission—deleting the variable on an older deployment alone does not enable other accounts. No database migration or ownership transfer is needed. See [ADR 0009](docs/adr/0009-allow-verified-users-to-own-separate-journals.md).

Missing/invalid configuration or database failures deny access and expose only generic feedback. No password sign-in, email/password registration UI, or test-provider switch exists in application code.

## Migrations and local startup

Run `pnpm dev:local` to start local development. It is the default entry point for humans and agents: it creates `.env.local` from `.env.example` when missing, fails with the list of required variables still empty (optional settings may be blank), installs dependencies with `pnpm install --frozen-lockfile`, applies migrations, and then runs the dev server. Extra arguments pass through to `next dev`. The script (`scripts/dev.sh`) does not enforce the Node version from `.node-version`.

The equivalent manual sequence applies migrations explicitly against the intended database **before** starting the configured app:

```sh
pnpm db:migrate
pnpm dev
```

`pnpm db:migrate` loads `.env.local` if present. An existing process-level `DATABASE_URL` takes precedence, including the disposable database supplied by the test harness. The checked-in SQL initializes Better Auth's schema, the financial journal (migration `0002_journal.sql`), refunds (migration `0003_refunds.sql`), the category naming rules (migration `0004_category_lifecycle.sql`), the record of Google Sheets exports (migration `0005_spreadsheet_exports.sql`), and budgets (migration `0006_budgets.sql`, which enables PostgreSQL's `btree_gist` extension). The runner applies pending files in one transaction, takes an advisory lock, and records applied names. Repeated runs skip applied migrations. Do not edit an applied migration; add a numbered SQL file. Builds, previews, and application startup never apply migrations.

For a production-like local run:

```sh
pnpm build
pnpm start
```

The build needs no credentials, database access, or financial records. Without runtime configuration, `/login` explains incomplete setup and disables sign-in; `/api/private` returns 503.

## Application-boundary tests

Prerequisites: Docker running, and Chromium installed:

```sh
pnpm exec playwright install chromium
pnpm build
pnpm test
# Focus a single file/scenario during development:
pnpm test tests/auth.spec.ts --project desktop -g 'verified owner'
```

The runner creates a uniquely named **PostgreSQL 17.9 Alpine** container on a random loopback port, generates a throwaway password, applies the actual migrations twice, and removes the container afterward. It never uses an inherited `DATABASE_URL`. CI runs this same harness; there is no separately deployed test service.

Playwright exercises the production build on desktop and a phone viewport. Its Node-only preload controls Google and Apple token/JWKS HTTP responses, while the browser follows the actual authorization URL and returns the real state cookie through Better Auth's callback. No session is preinserted. PKCE, user admission, PostgreSQL persistence, cookie handling, and sign-out run unchanged. The server clock advances between cases to respect production rate limits, and advances eight days for expiry coverage. Direct requests exercise authorization and request integrity. A native client in the specs sends only what the iOS app sends, plain HTTP with a bearer token and no cookies, Origin, or fetch metadata, and the preload publishes the signing keys tests use to mint the Google ID tokens it presents. A second production server without an auth secret proves missing configuration fails closed.

The provider preload is under `tests/`, is absent from the application import graph, is excluded from Vercel uploads, refuses Vercel execution, and requires the test database at loopback. Normal `pnpm start` does not load it. Never set `NODE_OPTIONS` to preload tests in a deployment. Extend this harness through browser flows and public HTTP responses rather than adding internal mock suites.

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

## Vercel and live verification

1. Link the `finance-buddy` Vercel project and select Next.js with Node 24.x. The committed pnpm version/lockfile select installation; build command is `pnpm build`.
2. Provision Neon and configure the five required environment variables for the target environment, plus `GOOGLE_IOS_CLIENT_ID`, and `MINIMUM_IOS_BUILD` if wanted, when the iOS app uses it. For Apple, also set `APPLE_CLIENT_ID` and `APPLE_CLIENT_SECRET`, plus `APPLE_IOS_BUNDLE_ID` for native Apple sign-in, as described in [the setup guide](docs/apple-sign-in.md). Preview deployments should use a separate Neon branch/database, secret, and stable preview origin with its own registered Google and Apple callbacks.
3. Apply migrations explicitly to that environment's database, using its direct Neon connection if preferred. Do not add migration commands to the Vercel build or startup scripts.
4. Deploy. Open `/login`, sign in with a real verified account, record income, an expense, and a refund, confirm the weekly figures persist after refresh, correct one entry's amount and date and delete another through the confirmation, export the period as a PDF and open the downloaded file, then sign out and confirm private requests are refused. Try another verified Google identity and confirm it gets its own journal, without the first account's records. Check mobile and desktop.
5. Record the deployment URL and results in `docs/verification.md`. Controlled provider tests do not establish real OAuth or Neon configuration. When Apple is enabled, also complete the [Apple verification checklist](docs/apple-sign-in.md#verify-real-configuration).
6. For the Sheets export, sign in with the authorized account, press **Export to Google Sheets**, authorize `drive.file` when asked, follow the returned link, and inspect the three tabs against the figures on screen. Then correct an entry and confirm the existing spreadsheet is unchanged. Record the result in `docs/sheets-export-verification.md`.
7. For the iOS app, work through the iPhone checklist in `docs/verification.md` against the deployment and record the results there. The controlled native-client tests do not establish Google Sign-In for iOS, Keychain storage, or the deployed origin.

References: [Next.js setup](https://nextjs.org/docs/app/getting-started/installation), [Better Auth Google](https://better-auth.com/docs/authentication/google), [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql), [identity admission](https://better-auth.com/docs/concepts/users-accounts), [shadcn/ui](https://ui.shadcn.com/docs/components/radix/button).

## Financial journal

`GET /api/journal` returns the authenticated owner's current Monday–Sunday report: date-only boundaries, all period entries, active category choices, totals, and spending breakdown. Monetary values are exact decimal strings with explicit MXN currency. PostgreSQL stores positive integer centavos; report arithmetic uses `bigint`. Total expenses are expenses minus refunds received in the period, so totals and category groups can be negative and are never clamped. Income excludes refunds. Net change describes recorded activity.

`POST /api/journal` accepts `{ id, kind, amount, date, categoryId, note }`. Use a stable UUID for retries, `income`, `expense`, or `refund`, a positive decimal string (up to 12 whole digits and two decimal places), an ISO movement date, a nullable category UUID, and a note of at most 2,000 characters. Refunds are entered as positive amounts on their receipt date and accept the owner's active expense categories; an archived category must be restored through category management before a new entry can use it. Ownership comes only from the trusted session. Requests require JSON and follow the request integrity rules below. Repeating the same ID/payload returns success without inserting another entry; reusing an ID with different values is rejected.

`PATCH /api/journal` corrects an existing entry and takes the same body as a save, where `id` names the entry to change. Every field is replaced, the creation rules apply unchanged, and one owner-scoped statement either applies the whole correction or changes nothing. The entry keeps the archived category it already carries while another field changes; a replacement category must be active, and both must belong to the movement type's own list, so an income category never survives a change to expense or refund.

`DELETE /api/journal` accepts `{ id }` and removes that entry permanently. There is no trash, restore, undo, or edit history. Deleting an entry that is not the owner's, or one already deleted, changes nothing and cannot recreate it. Category records and every other movement are untouched. Both methods require JSON, follow the same request integrity rules, and report a refusal as a `field` error exactly as saving does.

Starter categories are seeded transactionally once per owner. Renames and archives are preserved. Exports read this same summary and have their own sections below. Backdated entries outside the current week are durably saved and explicitly acknowledged without changing the current totals. Correcting an entry's date moves it out of one period and into the other, and both are recomputed from the stored movements.

## Refusals

Every refusal from a private endpoint, and from the auth route itself, is JSON with `error`, a human-readable message whose wording may change, and `code`, a stable identifier a client acts on instead. A field refusal also carries `field`, which is `null` when the body as a whole is unusable, and a Google Sheets export that needs authorization also carries `reconnect: true`. A code always travels with the same status:

| Code                     | Status | Meaning                                                                                          |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| `unauthenticated`        | 401    | No live session. Sign in again.                                                                  |
| `forbidden`              | 403    | The session's identity does not have a verified email.                                              |
| `request_not_allowed`    | 403    | Integrity failed: a foreign Origin, a cookie write without Origin, or a write without JSON.      |
| `not_found`              | 404    | The auth operation is not exposed.                                                               |
| `invalid_period`         | 400    | The day, week, or month named by `kind` and `date` cannot be resolved.                           |
| `invalid_field`          | 400    | The body was refused; `field` names the input at fault.                                          |
| `reconnect_required`     | 403    | Google Sheets export must be authorized again before exporting.                                  |
| `export_unconfirmed`     | 409    | An earlier attempt of this export was never confirmed; check Google Drive instead of retrying.  |
| `export_period_mismatch` | 409    | This export identifier already covers a different period.                                        |
| `upgrade_required`       | 426    | The app build named by the request is older than the server supports. Update the app.            |
| `unavailable`            | 503    | Configuration or the database is unavailable. Retry later.                                       |
| `not_confirmed`          | 503    | A write's outcome is unknown, or it did not complete. Retrying the same request is safe.         |

The session reader keeps Better Auth's reply shape, answering `null` with 403 or 503 rather than a refusal body. Refusals Better Auth raises while completing a sign-in carry Better Auth's own error body.

## Request integrity

A private request that names an Origin must name the configured one, however it is authenticated. A write authenticated by the session cookie must also name that Origin, because a browser attaches cookies to other sites' requests too. A write authenticated by a bearer token needs no Origin: only the client holding the token attaches it, and a native client has no origin to send. Every write carries a JSON body. No CORS headers are sent, so no other site's page can read a reply.

## App builds

The iOS app names its build in an `X-Finance-Buddy-Build` header on every request. A build is one or more dot-separated whole numbers, the form an iOS bundle version takes, compared number by number, so `12.1` is newer than `12` and older than `13`. When `MINIMUM_IOS_BUILD` is set, `/api/private` and every private endpoint refuse a request whose build is older, or unreadable, with 426 and `upgrade_required`, before its session is checked and before anything is read or written. A request naming no build, as every web request does, and a server without the setting, are never affected. Sign-in and sign-out are not gated, so an outdated app can still reach its session. A `MINIMUM_IOS_BUILD` that is not a build number fails configuration closed like any other invalid variable.

## Native client

The iOS app is a client of the same API as the web, under `docs/adr/0007-serve-the-native-ios-app-from-the-same-backend-with-bearer-sessions.md`:

1. **Sign in.** Generate a fresh nonce, pass it to Google Sign-In for iOS, and post the ID token with that nonce to `/api/auth/sign-in/social` (see Private configuration). Keep the value of the `set-auth-token` response header in the Keychain, never the `token` in the reply body.
2. **Send the same headers every time.** `Authorization: Bearer <token>` and `X-Finance-Buddy-Build: <bundle version>`, with no cookies and no Origin; a write also sends `Content-Type: application/json`.
3. **Replace the token when told.** Whenever a reply carries `set-auth-token`, store that value instead.
4. **Retry the same request, never a new one.** Give every new movement, category creation and Google Sheets export its own UUID before the first attempt, and after a lost reply or `not_confirmed` send exactly the same request again; corrections and deletions are safe to repeat as they are. `export_unconfirmed` is never retried: send the owner to Google Drive, then export again with a new identifier.
5. **Act on codes, not messages.** `unauthenticated`: delete the token and sign in again. `upgrade_required`: ask for an update and send nothing more. `reconnect_required`: tell the owner to connect Google Sheets on the web dashboard. `invalid_field`: mark `field`. `unavailable`: retry later.
6. **Use the server's calendar.** Omit `kind` and `date` for the current week, and take period labels and the default movement date from the `start`, `end`, and `today` of a reply. Never compute summary periods on the device, whatever its time zone.
7. **Ignore what you do not know.** The API only gains optional request fields, reply fields, and endpoints. Existing names and meanings never change; a change that cannot follow this rule arrives as a new endpoint.
8. **Sign out** by posting `{}` to `/api/auth/sign-out`, then delete the stored token.

For local development, a simulator reaching `http://localhost:3000` needs an App Transport Security exception in the app's debug configuration only; deployments are HTTPS, which the configuration check enforces on Vercel. Release builds embed one origin, so point them at a stable production domain rather than a preview deployment.

## API contract

Every private endpoint below proves a live owner session from the session cookie or a bearer token, refusing `unauthenticated`, `forbidden`, or `unavailable`; refuses an older or unreadable `X-Finance-Buddy-Build` with `upgrade_required` and a foreign Origin with `request_not_allowed`; and answers with `Cache-Control: private, no-store`. A write also needs `Content-Type: application/json`, and this app's Origin when it carries the cookie. Amounts are exact decimal strings in MXN, and dates are `YYYY-MM-DD` Mexico City calendar dates. `kind` is `day`, `week`, or `month`; omitting `kind` and `date` means the current week.

| Endpoint                                   | Input                                                                                                          | Success                                                                                                                                                      | Further refusal codes                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `GET /api/private`                         | none                                                                                                           | `{ userId, database }`. A session check only; it does not examine Origin.                                                                                   | none                                                                                                         |
| `GET /api/journal?kind=&date=`             | optional period                                                                                                | `{ kind, date, start, end, today, currency, income, expenses, netChange, categories, entries, breakdown, budget }`                                           | `invalid_period`                                                                                             |
| `POST /api/journal`                        | `{ id, kind, amount, date, categoryId, note }`                                                                 | `{ saved: true }`                                                                                                                                            | `invalid_field`, `not_confirmed`                                                                             |
| `PATCH /api/journal`                       | the same body; `id` names the entry                                                                            | `{ saved: true }`                                                                                                                                            | `invalid_field`, `not_confirmed`                                                                             |
| `DELETE /api/journal`                      | `{ id }`                                                                                                       | `{ saved: true }`                                                                                                                                            | `invalid_field`, `not_confirmed`                                                                             |
| `GET /api/journal/trends?kind=&date=`      | optional period                                                                                                | `{ kind, date, start, end, today, currency, length, points, previous, income, expenses, netChange, previousIncome, previousExpenses, categories }`            | `invalid_period`                                                                                             |
| `GET /api/journal/export?kind=&date=`      | optional period                                                                                                | `application/pdf`, an attachment named in `Content-Disposition`                                                                                              | `invalid_period`                                                                                             |
| `POST /api/journal/spreadsheet?kind=&date=` | `{ id }`                                                                                                      | `{ url, title }`                                                                                                                                             | `invalid_period`, `invalid_field`, `reconnect_required`, `export_unconfirmed`, `export_period_mismatch`, `not_confirmed` |
| `GET /api/budgets`                        | none                                                                                                           | `{ today, currency, now: { day, week, month }, repeating, upcoming, past, nextBefore }`                                                                     | none                                                                                                         |
| `PUT /api/budgets?kind=&date=`            | `{ amount, oneOff: false }`                                                                                    | `{ saved: true, budget }`                                                                                                                                    | `invalid_period`, `invalid_field`, `not_confirmed`                                                           |
| `GET /api/categories`                      | none                                                                                                           | `{ income, expense }`                                                                                                                                        | none                                                                                                         |
| `POST /api/categories`                     | `{ action: "create", kind, name, id? }`, `{ action: "rename", id, name }`, or `{ action: "archive" \| "restore", id }` | `{ changed: true }`                                                                                                                                   | `invalid_field`, `not_confirmed`                                                                             |

In a summary, each entry is `{ id, kind, amount, date, categoryId, category, note, currency }`, each category choice is `{ id, kind, name }`, and each breakdown group is `{ categoryId, category, amount }`. In a trend, each point is `{ start, end, label, tick, income, expenses, netChange }`, `previous` is the `{ start, end }` of the comparison span, and each spending group is `{ categoryId, category, amount, previous }`. Each managed category is `{ id, kind, name, active }`. A summary's `budget`, and the `budget` a budget write replies with, is a budget view `{ kind, start, end, amount, repeats, expenses, remaining, overBudget, daysLeft, leftPerDay }` for that period, or `null` when it has no budget. `remaining` is a signed amount. For the week or month containing today that is not over budget, `daysLeft` counts today through the period's last day and `leftPerDay` is `remaining` divided by `daysLeft`, rounded down to the centavo, so on the last day it equals `remaining`; both are `null` for a day budget, an ended or future period, and an overspent one. In the budgets list, `today` is the Mexico City date the list was resolved for, and `now.day`, `now.week` and `now.month` are the budget views for the day, week and month containing it, each `null` without a budget. `repeating` lists `{ kind, start, amount, until }` spans, and `upcoming` and `past` list budget views, with `nextBefore` as the cursor for more of `past`; these lists are empty for now.

The auth route exposes only these operations; any other path under `/api/auth` answers `not_found`.

| Operation                         | Used by | Input                                                                    | Success                                                                   | Refusals                                                                                                                                                  |
| --------------------------------- | ------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-in/social`   | iOS app | `{ provider: "google" \| "apple", idToken: { token, nonce } }`, no Origin           | `{ redirect: false, token, user }`, and the session in `set-auth-token`   | `invalid_field` without a nonce, `request_not_allowed` for a foreign Origin, `unavailable`; a token or identity that is not accepted gets Better Auth's own 401 or 403 body |
| `POST /api/auth/sign-in/social`   | web     | `{ provider: "google" \| "apple", callbackURL, errorCallbackURL }` with Origin      | The provider's authorization URL                                         | `request_not_allowed`, `unavailable`                                                                                                                      |
| `GET /api/auth/callback/google`   | web     | Google's redirect                                                        | the session cookie and a redirect into the app                            | a redirect to `/login?error=`                                                                                                                             |
| `POST /api/auth/callback/apple`  | web     | Apple form POST from `https://appleid.apple.com` with code/state | redirects to GET callback, which verifies state/cookie and starts the session | invalid state redirects to `/login?error=`; other origins are refused |
| `GET /api/auth/callback/apple`   | web     | Redirect from Apple POST with code/state | session cookie and redirect into the app | redirect to `/login?error=` |
| `POST /api/auth/link-social`      | web     | the Google Sheets connection, with Origin                                | The provider's authorization URL                                         | `request_not_allowed`                                                                                                                                     |
| `GET /api/auth/get-session`       | both    | the cookie or a bearer token                                             | `{ session, user }`, or `null` without a session                          | `null` with 403 for an identity that is not the owner, or 503                                                                                             |
| `POST /api/auth/sign-out`         | both    | `{}`; with a bearer token, no Origin                                     | `{ success: true }`, that session deleted                                 | `request_not_allowed`                                                                                                                                     |
| `POST /api/auth/revoke-sessions`  | both    | `{}`; with a bearer token, no Origin                                     | `{ status: true }`, every session of the owner deleted                    | `request_not_allowed`                                                                                                                                     |

## Budgets

A budget is the most a person intends to spend in a day, week, or month (see `CONTEXT.md` and `docs/adr/0010-repeating-budgets-on-total-expenses.md`). It is measured against that period's total expenses with the summary's own arithmetic: refunds received in the period give room back, uncategorized and archived-category expenses count, spending recorded before the budget was set counts, and income never adds to it. Days, weeks, and months are budgeted independently, even where they overlap.

`PUT /api/budgets?kind=&date=` names the period exactly as the summary does and takes `{ amount, oneOff: false }`. `amount` follows the Amount format but may be zero, and `oneOff` must be a boolean; only repeating budgets can be set so far, so `oneOff: true` is refused on `oneOff`. The budget repeats from the resolved period through every later period of that kind. Setting it again from the period where it starts replaces the amount from there on, and setting it from a later period takes over from that period. The reply is the budget view that now applies to the named period, read after the change commits, and repeating the identical request leaves the same budgets and the same reply. Rows store spans of periods rather than one row per period, and a period's budget is resolved when it is read, so nothing runs on a schedule.

The remaining budget is the budget minus total expenses. It is never clamped, so it can exceed the budget when refunds outweigh expenses. A period is over budget only when its total expenses exceed the budget, which the dashboard reads as "Over by MXN X"; spending exactly the budget leaves MXN 0.00. The dashboard shows a read-only budget card for the period on screen, or says the period has no budget, and links to Budgets. Nothing carries over between periods.

For the current week or month, the dashboard card and the Budgets page also show how much is left per day: the remaining budget shared across the days left, counting today, rounded down to the centavo so following it never goes over budget. It is worded as what is still available, never as what should already have been spent, and it is hidden for day budgets, ended and future periods, and once a period is over budget, where the overspend shows instead.

The Budgets page, between Dashboard and Categories in the navigation, lists today's day, week, and month under Now, each with its figures and a Repeating label or a Set budget action, and explains budgets to a person who has none yet. Its form takes a period kind, any date in the period (the current one by default), and an amount. It names the resolved period, such as "Week of 14–20 Sep", fills in the budget that already applies to it, and says when the chosen period has ended.

## Trends

`GET /api/journal/trends?kind=&date=` resolves a period exactly as the report does, and refuses an unresolvable one in the same words. It answers with the consecutive periods ending with that one: fourteen days, twelve weeks, or twelve months, each carrying its own income, expenses, and net change. Movements are placed into periods by the same Mexico City calendar boundaries a summary uses, so every point reconciles with the summary for that period and a refund reduces expenses in the period it was received.

The same reply carries spending by category across the whole span beside the same categories across the equally long span immediately before it, along with both spans' totals. One statement reads both spans, so the comparison never mixes two snapshots of the journal. Past six spending groups the remainder folds into a single **Other categories** group that keeps its figures, so the groups still sum to the span's total expenses.

The dashboard charts this reply and requests it together with the summary, accepting both or neither, so a chart and a figure on that page can never describe different periods. Every chart is drawn from plain elements rather than a charting dependency, ships a table of the same figures, and gives each mark an accessible name carrying its period and amount.

## PDF export snapshots

**Export PDF** on the dashboard downloads a snapshot of the period on screen, never of the current period unless that is what is shown. `GET /api/journal/export?kind=&date=` resolves the same period as the report, reads one summary, and replies with `application/pdf` as an attachment. A native client downloads the same file, name included, with its bearer token. Nothing is stored: there is no public link, no hosted copy, no export history, and no synchronization. A failed generation reports an actionable retry and leaves the journal untouched.

The document names the period it covers and, separately, the export date in Mexico City time, which also appears in the filename `finance-buddy-<kind>-<start>-to-<end>-exported-<export date>.pdf`. It carries total income, total expenses after refunds, net change, the category breakdown including Uncategorized and archived categories, and every financial movement in the period with its date, type, signed amount, category, and note. Nothing is paginated away: long notes and names wrap, a note longer than a whole page carries on across pages, and the movement list continues with repeated column headings and page numbers. The report's fonts write the Latin-1 range, so any other character in a note or a category name is written as `?` rather than refusing the export. An empty period reports zero totals and no rows. A downloaded file is a snapshot: later corrections, deletions, renames, and archives never change it, and only a new export reflects them.

## Google Sheets export

The dashboard carries **Export to Google Sheets** next to **Export PDF** on phone and desktop. It exports the period currently on screen, so the spreadsheet covers exactly the day, week, or month whose totals are displayed.

Sign-in and export authorization are separate. Signing in never asks for file access; the first export that needs it offers **Connect Google Sheets export**, which asks Google for `drive.file` alone. Declining or revoking it leaves sign-in, the journal, categories, and every other operation untouched, and the control is offered again the next time an export runs.

`POST /api/journal/spreadsheet?kind=&date=` names the period exactly as the report and the PDF export do, takes `{ id }` as its body, requires JSON, follows the request integrity rules, and proves a live owner session before anything else. `id` is a UUID naming this export. The response is `{ url, title }`, and a refusal is `{ error }` with `reconnect: true` when the owner has to authorize Google again. Provider tokens are minted per request on the server and are never returned. A native client exports with its bearer token and no Origin, using the authorization granted on the web dashboard: connecting Google Sheets happens only on the web, so a `reconnect_required` refusal sends the owner there, and signing in natively never drops that authorization.

Each explicit export creates a new spreadsheet from the same owned-period dataset as the on-screen summary: a **Summary** tab with the covered start and end dates, the Mexico City generation date, MXN totals, net change, and entry count; a **Categories** tab with the same breakdown, including Uncategorized and archived categories; and an **Entries** tab with every movement, its type, category, note, and signed amount, where a refund reads as the reduction it is. The generation date is also in the spreadsheet title and is distinct from the period covered. Amounts are written as numbers; category names and notes are written as literal text, so input that looks like a formula stays text.

The whole snapshot is written by the request that creates the spreadsheet, so a link is returned only once all of it is in it. A repeated submission of the same export returns the spreadsheet it already finished instead of creating another, and an identifier never covers a different period. When Google answers with a failure, nothing was created and the same export can be retried; when no answer arrives at all, the export is marked unconfirmed and refuses to create a second spreadsheet blindly, pointing the owner at Google Drive before exporting again. No failure changes financial records or categories.

Snapshots are copies, not synchronized views: correcting or deleting movements, and renaming or archiving categories, never changes an existing spreadsheet, and the owner's own spreadsheet edits are never read back. A later explicit export creates a new artifact with the current data. There is no continuous sync, no scheduled export, and no sharing beyond the owner's own new file.

## Category management

The `/categories` page manages the separate income and expense lists, and is reached from the navigation drawer on every signed-in page. `GET /api/categories` returns both lists with each category's archived state. `POST /api/categories` accepts one change: `{ action: "create", kind, name }`, `{ action: "rename", id, name }`, or `{ action: "archive" | "restore", id }`. There is no merging, no conversion between lists, and no permanent deletion. A creation may carry its own UUID `id`, which makes it safe to retry: repeating it with the same list and name answers success without creating another category, while the same identifier with a different list or name, or an identifier that is not the owner's, is refused on `id`. Without an `id`, creation behaves as before and the server assigns one.

A name is trimmed, holds 1 to 40 characters, carries no control characters, and is unique case-insensitively within one list, counting archived categories, so a taken name is restored or renamed rather than recreated (see `docs/adr/0005-bounded-category-names.md`). A database constraint and unique index enforce the same rules as request validation.

Categories are related to financial movements by identity, never by label text, so a rename shows at once on existing entries, totals, and breakdowns. Archiving removes a category from the choices for new entries while every recorded movement, total, and breakdown keeps it; restoring the same category makes it selectable again without a replacement. Uncategorized reporting is unchanged, and entries stay optional-category. Every read and change is scoped to the signed-in owner by the statement itself, so another owner's category identifier matches nothing.

## Corrections and deletion

Every entry in the selected period carries Edit and Delete controls, including historical and uncategorized ones. Editing reopens the entry form on its recorded values under the heading **Edit entry** and enforces the same rules as recording it. Deleting opens a confirmation naming the entry's type, amount, movement date and category; keeping the entry changes nothing, and confirming removes it permanently from the journal and from every day, week, and month total that included it.

A correction that is refused keeps the form values on screen, marks the field at fault, and never reports success. A correction or deletion whose response is lost says so and can be retried safely, because both apply the same values again rather than adding anything. Duplicate submission is disabled while either is pending, and the outcome takes focus when the control pressed disappears with its row.

## Appearance

The theme menu at the foot of the navigation drawer switches between light, dark, and the device's system setting. **Settings → Appearance** also chooses a color scheme for each mode separately (Sage, Neutral, Ocean, Rose, or Amber). Appearance is a preference of the browser rather than the journal: it is stored in `localStorage` and applied by an inline script before first paint.

Every color is a CSS variable in `src/app/globals.css`, exposed to Tailwind through `@theme inline`. To add a scheme, add a `[data-light-scheme="<id>"]:not(.dark)` block and a `.dark[data-dark-scheme="<id>"]` block overriding the scheme variables, then list the id in `src/lib/appearance.ts`. Chart hues belong to the mode rather than the scheme, so a series keeps its identity whichever scheme is chosen.
