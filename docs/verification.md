> Historical evidence below includes the former owner-only policy. [ADR 0009](adr/0009-allow-verified-users-to-own-separate-journals.md) supersedes that admission rule: any verified Google or Apple email may sign in, with records isolated by user ID. Live checklists below reflect the new policy.

# Verified-user access and sidebar navigation — September 13, 2026

- Removed the owner-email allowlist. Browser and native Google/Apple sign-in admit any verified email, including Apple relay addresses. Tests cover separate journals, cross-user write refusal, PDF isolation, stable identities after email changes, and revoking only the current user's sessions.
- Reproduced the collapsed sidebar defect with a focused browser regression: the transparent Preferences label intercepted Categories clicks after a reload. Hidden labels now use `visibility: hidden`, preserving the layout while allowing the links underneath to receive clicks. The test also checks re-expansion and phone drawer navigation.
- The focused category/sidebar run passed all 18 cases across desktop and phone. The final full suite passed 172 cases with zero failures and 12 intentional skips (native-client/app-build cases run once on desktop). Typecheck, lint, and production build passed. Standards and spec reviews found no issues.

# Private shell verification — issue #2

Verified September 11, 2026.

## Local application evidence

- Node 24.20.0 and pnpm 10.29.2.
- Production build and TypeScript checks passed without application secrets or database connectivity.
- ESLint passed.
- 24 Playwright cases passed: 12 scenarios each on desktop Chromium and an iPhone 13 viewport using Chromium.
- Every test run creates fresh PostgreSQL 17.9 Alpine in Docker, applies the committed migration, repeats migration application successfully, and removes the database afterward.
- Controlled Google callback succeeds for the verified owner; refresh preserves the stable user ID and active database-backed session.
- Stranger, unverified owner, and a returning Google subject with a changed email are rejected by the identity policy. The tests assert the policy error, not merely any provider failure.
- Unauthenticated/invalid-cookie access, forged ID token, callback without state, cross-origin sign-in, password endpoints, provider failure, sign-out with cookie replay, and eight-day session expiry are covered.
- An ordinary production server with missing owner configuration disables sign-in and refuses protected requests.
- Login and home screenshots inspected on desktop and phone. Keyboard focus reaches Google sign-in; the home has no horizontal overflow. Screenshots are generated under ignored `test-results/`.

## Vercel evidence

Project: `guillermo-ortizs-projects/finance-buddy`.

[Preview deployment](https://finance-buddy-9hlkoaq42-guillermo-ortizs-projects.vercel.app) · [Vercel build](https://vercel.com/guillermo-ortizs-projects/finance-buddy/EYnYrohFU7esRtMFUsMjmxhefYCa)

- Vercel installed from the frozen pnpm lockfile, built Next.js successfully, and marked deployment `READY`.
- Authenticated Vercel CLI preview check: `GET /login` returned **200**, showing incomplete setup and a disabled sign-in control.
- `GET /api/private` returned **503** with only `{"error":"Workspace temporarily unavailable."}`.
- Preview deployment protection remains enabled. Vercel CLI used its authorized protection bypass for these checks; this does not bypass application authentication.

## Remaining live checks / exact blockers

At verification, `vercel env ls` reported **no environment variables** in the project. No live Neon connection, Google OAuth client credentials, application auth secret, base origin, or private owner address are available to this implementation session.

Configure `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` privately in Vercel, register the exact Google callback, explicitly migrate the target Neon database, and redeploy. Then use the owner's actual Google account to verify sign-in, private home/database connectivity, refresh, sign-out, and a separate journal for another verified account.

**Real Google sign-in and Neon connectivity have not passed live verification.** The deployed unconfigured login screen is not evidence of those acceptance criteria. Keep issue #2 open until that evidence is recorded. No financial features or live financial data were introduced.

# Native iOS app verification — issues #35 to #43

**Not yet performed live.** Real Google Sign-In for iOS, Keychain storage and a deployed origin can only be proven with a real iPhone against a deployment; the controlled tests below do not establish them.

## Local application evidence

Verified September 13, 2026, on branch `feat/ios-native-backend` at commit `157133e`.

- TypeScript and ESLint passed on every ticket's commit; the production build passed before each test run.
- 158 Playwright cases ran: 144 passed and 14 skipped. The skipped cases are the native-client and app-build scenarios, which exercise request headers rather than a viewport and run on desktop only.
- Docker was unavailable on the verification machine, so the suite ran the same steps as the committed runner against a disposable local PostgreSQL 18.6 cluster: fresh database, migrations applied twice, then Playwright. CI still runs the Docker harness with PostgreSQL 17.9.
- Covered: native ID-token sign-in for the iOS and web audiences, refusal of other identities and of foreign, expired, altered, nonce-less and nonce-mismatched tokens; signed bearer tokens only, never falling back to a cookie; bearer reads, writes, category changes, PDF and Google Sheets exports; request integrity for cookie and bearer writes; refusal codes; the minimum app build; retry-safe category creation; bearer sign-out, **Sign out everywhere** on desktop and phone, and eight-day expiry.

## Before the pass

1. Create an **iOS** OAuth client in the same Google Cloud project as the web client.
2. Set `GOOGLE_IOS_CLIENT_ID`, and `MINIMUM_IOS_BUILD` if an oldest build is wanted, for the target Vercel environment, then redeploy.
3. Install an app build pointing at that deployment's stable origin.

## iPhone checklist

- [ ] Sign in natively with the owner's Google account; the app opens on this week.
- [ ] Sign in with another verified Google identity; it gets a separate journal and cannot access the first account's records.
- [ ] Record income, an expense, and a refund; after a refresh the web registry shows all three.
- [ ] Correct one movement's amount and date, and delete another; the app and the web agree on the day, week, and month totals each touched.
- [ ] Browse a past month; its figures match the web dashboard for that month.
- [ ] Export a PDF from the app and open it from the share sheet; the file name names the covered period and the export date.
- [ ] With Google Sheets connected on the web dashboard, export from the app and open the returned spreadsheet.
- [ ] Sign out in the app; the web stays signed in.
- [ ] Sign in on the app again, then confirm **Settings → Sessions → Sign out everywhere** on the web; the app's next request is refused and it returns to sign-in, and the browser is back at `/login`.
- [ ] If `MINIMUM_IOS_BUILD` is set above the installed build, the app is asked to update and nothing it sends is written.

Record the deployment URL, the app build, the iOS version, the date, and each result here.
