# Weekly financial journal — issue #3

Verified locally September 11, 2026 with Node 24, pnpm 10.29.2, a production Next.js build, controlled Google responses, and disposable PostgreSQL 17.9 Alpine.

- Typechecking, ESLint, and production build passed without production credentials.
- Full application suite: 40 cases passed, covering 20 scenarios on desktop Chromium and an iPhone 13 viewport.
- Journal coverage includes exact 10,000 / 1,500 / 8,500 totals, 0.10 + 0.20 = 0.30, optional fields, durable refresh and second Google-authenticated session, once-only starter categories, archived/foreign/incompatible categories, unauthenticated and cross-origin requests, server-derived ownership, duplicate/concurrent requests, and a committed save whose response is lost.
- Date cases cover Mexico City Sunday while UTC is Monday, Monday–Sunday membership, a backdated entry retrieved when the reporting clock is moved back, leap day, New Year, and midnight while both the workspace and form remain open.
- A 106-entry period verifies complete totals and stable ordering. Report failure returns 503 and shows a retryable error instead of an empty period.
- Desktop and phone screenshots of the weekly overview and form were inspected. Form controls, optional note text, validation, totals, and category breakdown remain readable; the overview has no horizontal overflow.
- Additional focused regression checks cover clearing invalid-field accessibility state after cancel/reopen and permitting today's date in the native input after midnight.

## Code review

Reviewed against starting commit `353a87d6852d607372dfe0f3993d69d18d68cad6`, using independent Standards and Spec reviewers.

### Standards

No documented-standard violations. One maintainability finding: error-message text was being parsed to identify invalid fields. Resolved with structured field/message errors. The follow-up stale accessibility state on cancel or report failure was also corrected and covered.

### Spec

One date-default finding: an open workspace could retain yesterday's date across midnight. Resolved by refreshing the report on form opening and before submission. The native date input no longer carries a stale maximum; shared client validation and server validation reject future dates. Application tests cover both midnight transitions.

Standards: 1 finding resolved, no outstanding hard violations. Spec: 1 finding resolved, no outstanding implementation findings.

## Deployment

Apply `migrations/0002_journal.sql` using the explicit migration runner before enabling this build against a configured database. Builds and application startup do not run migrations. No production data was read or modified for tests.

Live Neon/Google verification and production deployment were not performed for this PR. The controlled provider exercises the real Better Auth flow but does not establish live credential/configuration readiness. Use a suitable preview database and real authorized Google account for the deployment smoke test described in README.md.
