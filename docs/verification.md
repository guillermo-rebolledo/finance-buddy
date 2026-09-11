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

Configure `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `PRIVATE_OWNER_EMAIL` privately in Vercel, register the exact Google callback, explicitly migrate the target Neon database, and redeploy. Then use the owner's actual Google account to verify sign-in, private home/database connectivity, refresh, sign-out, and rejection of another account.

**Real Google sign-in and Neon connectivity have not passed live verification.** The deployed unconfigured login screen is not evidence of those acceptance criteria. Keep issue #2 open until that evidence is recorded. No financial features or live financial data were introduced.
