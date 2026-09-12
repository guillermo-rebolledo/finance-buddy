# Finance Buddy

A private personal finance journal. The private weekly overview records income, expenses, and refunds in MXN, with optional categories and notes, exact totals, and Mexico City movement dates.

## Tooling

Use Node **24.20.0** (`.node-version`) and pnpm **10.29.2** (`packageManager`). Runtime dependencies are exact-pinned and `pnpm-lock.yaml` is committed. Next.js 16.3.5, React 19.3.0, Better Auth 1.7.4, Tailwind CSS 4.3.3, and shadcn/ui Radix components are used. The vendored UI components were installed with shadcn CLI 4.21.0. TypeScript 6.0.2 and ESLint 9.39.4 match the current Next ESLint plugin peer ranges.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

## Private configuration

Configure all six variables; none are `NEXT_PUBLIC_`:

| Variable               | Value                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Neon PostgreSQL connection string with `sslmode=require`; use the pooled endpoint for the app.            |
| `BETTER_AUTH_URL`      | Exact origin, without a trailing slash. HTTPS for Vercel; `http://localhost:3000` for local development.  |
| `BETTER_AUTH_SECRET`   | Random secret of at least 32 characters; generate with `openssl rand -base64 48`.                         |
| `GOOGLE_CLIENT_ID`     | Google OAuth web client ID.                                                                               |
| `GOOGLE_CLIENT_SECRET` | Matching Google OAuth client secret.                                                                      |
| `PRIVATE_OWNER_EMAIL`  | The privately supplied owner address. Used only for admission/authorization, never as a record owner key. |

Create a Google OAuth **Web application** client, set the application origin, and register the exact callback `<BETTER_AUTH_URL>/api/auth/callback/google`. Local and deployment callbacks must be registered separately. Add the owner as a consent-screen test user if the Google project is in testing mode. Only basic identity scopes are requested; Sheets authorization is outside this increment.

All admitted identities must have a verified Google email matching the configured owner. Better Auth's stable `user.id` is the future record ownership key. Every protected request revalidates the database session and private-launch owner policy. Session cookies are HTTP-only, same-site, secure on HTTPS, and are not used as a cache of authorization. Sessions expire after seven days, subject to Better Auth's rolling refresh, and sign-out deletes the session.

Missing/invalid configuration or database failures deny access and expose only generic feedback. No password sign-in, public registration UI, or test-provider switch exists in application code.

## Migrations and local startup

Apply migrations explicitly against the intended database **before** starting the configured app:

```sh
pnpm db:migrate
pnpm dev
```

`pnpm db:migrate` loads `.env.local` if present. An existing process-level `DATABASE_URL` takes precedence, including the disposable database supplied by the test harness. The checked-in SQL initializes Better Auth's schema, the financial journal (migration `0002_journal.sql`), refunds (migration `0003_refunds.sql`), and the category naming rules (migration `0004_category_lifecycle.sql`). The runner applies pending files in one transaction, takes an advisory lock, and records applied names. Repeated runs skip applied migrations. Do not edit an applied migration; add a numbered SQL file. Builds, previews, and application startup never apply migrations.

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

Playwright exercises the production build on desktop and a phone viewport. Its Node-only preload controls Google's token/JWKS HTTP responses, while the browser follows the actual authorization URL and returns the real state cookie through Better Auth's callback. No session is preinserted. PKCE, user admission, PostgreSQL persistence, cookie handling, and sign-out run unchanged. The server clock advances between cases to respect production rate limits, and advances eight days for expiry coverage. Direct requests exercise authorization and request integrity. A second production server without the owner setting proves missing configuration fails closed.

The provider preload is under `tests/`, is absent from the application import graph, is excluded from Vercel uploads, refuses Vercel execution, and requires the test database at loopback. Normal `pnpm start` does not load it. Never set `NODE_OPTIONS` to preload tests in a deployment. Extend this harness through browser flows and public HTTP responses rather than adding internal mock suites.

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

## Vercel and live verification

1. Link the `finance-buddy` Vercel project and select Next.js with Node 24.x. The committed pnpm version/lockfile select installation; build command is `pnpm build`.
2. Provision Neon and configure the six environment variables for the target environment. Preview deployments should use a separate Neon branch/database, secret, and stable preview origin with its own registered Google callback.
3. Apply migrations explicitly to that environment's database, using its direct Neon connection if preferred. Do not add migration commands to the Vercel build or startup scripts.
4. Deploy. Open `/login`, sign in with the real verified owner, record income, an expense, and a refund, confirm the weekly figures persist after refresh, then sign out and confirm private requests are refused. Try another Google identity and confirm denial. Check mobile and desktop.
5. Record the deployment URL and results in `docs/verification.md`. Controlled Google tests do not establish real OAuth or Neon configuration.

References: [Next.js setup](https://nextjs.org/docs/app/getting-started/installation), [Better Auth Google](https://better-auth.com/docs/authentication/google), [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql), [identity admission](https://better-auth.com/docs/concepts/users-accounts), [shadcn/ui](https://ui.shadcn.com/docs/components/radix/button).

## Financial journal

`GET /api/journal` returns the authenticated owner's current Monday–Sunday report: date-only boundaries, all period entries, active category choices, totals, and spending breakdown. Monetary values are exact decimal strings with explicit MXN currency. PostgreSQL stores positive integer centavos; report arithmetic uses `bigint`. Total expenses are expenses minus refunds received in the period, so totals and category groups can be negative and are never clamped. Income excludes refunds. Net change describes recorded activity.

`POST /api/journal` accepts `{ id, kind, amount, date, categoryId, note }`. Use a stable UUID for retries, `income`, `expense`, or `refund`, a positive decimal string (up to 12 whole digits and two decimal places), an ISO movement date, a nullable category UUID, and a note of at most 2,000 characters. Refunds are entered as positive amounts on their receipt date and accept the owner's active expense categories; an archived category must be restored through category management before a new entry can use it. Ownership comes only from the trusted session. Requests require JSON and the configured Origin. Repeating the same ID/payload returns success without inserting another entry; reusing an ID with different values is rejected.

Starter categories are seeded transactionally once per owner. Renames and archives are preserved. Corrections and exports remain separate issues. Backdated entries outside the current week are durably saved and explicitly acknowledged without changing the current totals.

## Category management

The `/categories` page manages the separate income and expense lists, and is reached from the header on every signed-in page. `GET /api/categories` returns both lists with each category's archived state. `POST /api/categories` accepts one change: `{ action: "create", kind, name }`, `{ action: "rename", id, name }`, or `{ action: "archive" | "restore", id }`. There is no merging, no conversion between lists, and no permanent deletion.

A name is trimmed, holds 1 to 40 characters, carries no control characters, and is unique case-insensitively within one list, counting archived categories, so a taken name is restored or renamed rather than recreated (see `docs/adr/0005-bounded-category-names.md`). A database constraint and unique index enforce the same rules as request validation.

Categories are related to financial movements by identity, never by label text, so a rename shows at once on existing entries, totals, and breakdowns. Archiving removes a category from the choices for new entries while every recorded movement, total, and breakdown keeps it; restoring the same category makes it selectable again without a replacement. Uncategorized reporting is unchanged, and entries stay optional-category. Every read and change is scoped to the signed-in owner by the statement itself, so another owner's category identifier matches nothing.
