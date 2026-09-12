# Export dated snapshots directly to Google Sheets — issue #9

Verified locally September 11, 2026 with Node 24, pnpm 10.29.2, a production Next.js build, controlled Google responses, and disposable PostgreSQL 17.9 Alpine. Migration `0005_spreadsheet_exports.sql` adds the record of exports; no existing table changed.

- Typechecking, ESLint, and the production build passed without production credentials.
- Full application suite: 118 cases passed, covering 59 scenarios on desktop Chromium and an iPhone 13 viewport, after merging the PDF export work from issue #8.
- **Export action.** The overview carries Export to Google Sheets beside Add entry on both viewports, and exports the period whose totals are on screen. The control is disabled while an export is pending, so a second submission cannot start.
- **Separate authorization.** Signing in never asks for file access. The first export offers Connect Google Sheets export, which asks Google for `drive.file` only, offline, with consent, and with the sign-in scopes preserved. Declining leaves the session, the journal, and category management working, and the connection is offered again on the next export.
- **Snapshot contents.** The spreadsheet holds a Summary tab (period label, covered start and end dates, Mexico City generation date, currency, total income, total expenses, net change, entry count), a Categories tab equal to the on-screen breakdown, and an Entries tab with every movement. Income, expenses, and refunds all appear, a refund reads as a negative amount, Uncategorized and archived categories are reported under their own names, and notes are included.
- **Same dataset.** Totals and rows in the captured spreadsheet were compared with `GET /api/journal` for the same period, including a week reporting 5,000.00 income, 1,100.24 total expenses, and +3,899.76 net change with a Groceries group of 1,000.25 after a refund.
- **Literal text.** A note of `=SUM(A1:A2)` is written as a string cell, never as a formula; amounts are written as numbers with a two-decimal format.
- **Dates.** The covered period and the generation date are separate cells, and the generation date is also in the spreadsheet title.
- **Empty and long periods.** An empty day exports zero totals with no invented rows. A month of thirty entries exports all thirty rows and a 300.00 total.
- **One artifact per export.** Two explicit exports create two different spreadsheets with the figures as they stood at each export. Submitting the same export identifier again returns the spreadsheet already finished without creating another, and an identifier aimed at a different period is refused.
- **Failures.** Exhausted quota and a provider error report that nothing was created and the same export can be retried; the retry then creates exactly one spreadsheet. A revoked permission and a refused token refresh ask for reconnection without touching app access. A request that gets no reply at all is marked unconfirmed, refuses to create a second spreadsheet on retry, and points at Google Drive; a deliberate new export still works. Financial records and categories were unchanged after every failure.
- **Token expiry.** An access token that expires is refreshed at the provider boundary and the export succeeds; when the refresh is refused the export asks for reconnection and creates nothing.
- **Snapshot invariance.** After an export, an entry was corrected and another deleted through the app's own controls, and a category was renamed through category management. The spreadsheet Google received was unchanged, no request was ever made to an existing spreadsheet, and a later explicit export carried the new figures under the new category name.
- **Ownership.** Unauthenticated export requests are refused with 401, cross-origin and non-JSON requests with 403, and invalid identifiers or unresolvable periods with 400. No spreadsheet is created in any of those cases.
- Desktop and phone screenshots of the export result were inspected. Screenshots are generated under ignored `test-results/`.

## Code review

Reviewed against starting commit `9a79bf3`, using independent Standards and Spec reviewers.

### Standards

No documented-standard violations. Resolved findings:

- A repeated submission of a finished export rebuilt the spreadsheet title from today's data, so the link could name a generation date the spreadsheet does not carry. The title is now built from the export's own stored date, and a repeated submission returns exactly what the first one returned.
- A lost response cleared the export identifier in the browser, so the next press would have created a second spreadsheet. The identifier is now kept, and retrying it either returns the finished spreadsheet or reports that the earlier attempt was never confirmed.
- The refusal response was assembled twice in the route; one helper now shapes every refusal.
- The browser Better Auth client was created twice; sign-in, sign-out and export authorization now share one.
- The connection notice was threaded through two components as a forwarded prop; the component that renders it now reads it where Google's callback left it.
- The unused spreadsheet identifier column was dropped, and the export's period is taken from the summary it already resolved instead of being derived a second time.

### Spec

Three findings resolved, one accepted as recorded.

- A failure after the spreadsheet was created (an unreadable reply, or a failed write of the resulting link) reported that nothing was created and invited a retry. Those paths now mark the export unconfirmed, so no second spreadsheet is created and the owner is told to check Google Drive.
- A Google 5xx was treated as "created nothing" and allowed a retry under the same identifier. Only refusals that precede creation are retried as themselves now; a provider failure marks the export unconfirmed.
- The spreadsheet title on a repeated submission, as above.
- Accepted: an unavailable workspace surfaces as a reconnect prompt. Every export request proves a live database-backed session first, so a database outage is refused with 503 before export authorization is consulted.

Standards: 6 findings resolved, no outstanding hard violations. Spec: 3 findings resolved, no outstanding implementation findings; the live Google check remains blocked as recorded below.

## Merge with PDF export

`main` gained the PDF export of issue #8 while this work was in progress. Both exports now sit side by side.

- The overview carries Add entry, Export PDF, and Export to Google Sheets in one wrapping row, and the Sheets control is disabled while a PDF is being prepared.
- The Sheets endpoint moved to `POST /api/journal/spreadsheet?kind=&date=` and names its period through the shared `requestedPeriod` resolution introduced by #8, so the report, the PDF, and the spreadsheet can only ever cover a period the overview itself can show. The export identifier stays in the request body.
- The two application-boundary suites are separate files, `tests/export.spec.ts` for PDF and `tests/sheets-export.spec.ts` for Sheets, and their helpers share one module.

## Deployment

Apply `pnpm db:migrate` to the target database before deploying this change; builds and application startup do not run migrations. No production data was read or modified for tests.

## Remaining live checks / exact blockers

The live Google verification named in the ticket was **not performed**. Blockers:

- No authorized Google account, real OAuth client, or Vercel deployment credentials are available in this environment, so no real consent, real spreadsheet, or real link could be produced.
- The Google Cloud project must have the **Google Sheets API** and **Google Drive API** enabled, and `https://www.googleapis.com/auth/drive.file` listed on the consent screen, before the owner can authorize export. That configuration could not be inspected or changed from here.

Controlled Google responses establish the app's behaviour at its external boundary. They do not establish live success. Perform step 6 of the README deployment checklist with the authorized account and record the deployment URL, the spreadsheet link, and what its tabs contained.
