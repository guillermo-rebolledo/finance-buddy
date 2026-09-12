# Download dated PDF export snapshots — issue #8

Verified locally September 11, 2026 with Node 24, pnpm 10.29.2, a production Next.js build, controlled Google responses, and disposable PostgreSQL 17.9 Alpine. No migration accompanies this change: an export reads the existing `financial_movement` and `category` tables and writes nothing.

- Typechecking, ESLint, and the production build passed without production credentials.
- Full application suite: 100 cases passed, covering 50 scenarios on desktop Chromium and an iPhone 13 viewport. Eighteen of them are the export scenarios, run on both viewports.
- **Export PDF** sits beside **Add entry** on the overview and exports the period whose figures are on screen. A browsed July 2026 exports July, not the current period, and the current week exports the current week.
- One summary read supplies the file: totals, category breakdown, and rows in an artifact always describe the same state as the summary the overview shows for that period.
- Each document names the period it covers, its start and end dates, the export date in Mexico City time, and MXN, then reports total income, total expenses after refunds, net change, the category breakdown, and every movement's date, type, signed amount, category, and note.
- The export date names the file: `finance-buddy-week-2026-08-31-to-2026-09-06-exported-2026-09-06.pdf`. It is stated separately inside the report as `Exported on 2026-09-06 (Mexico City time)`, never derived from the period covered.
- Exact amounts survive: `MXN 1,250.55` and `-MXN 50.55` read as recorded. A refund-only week reports total expenses `-MXN 290.00` and net change `+MXN 290.00`, with negative `Groceries` and `Uncategorized` groups, and an archived category keeps its name in both the breakdown and its rows.
- A note at the 2,000-character limit continues onto a second page under repeated column headings and reads back whole and in order; nothing of it is cut.
- A 120-movement month spans four pages with repeated column headings and `Page 1 of 4` through `Page 4 of 4`. Every recorded movement appears, and no in-app display limits the artifact. Long notes and long category names wrap inside their own columns.
- An empty period exports `MXN 0.00` across income, expenses, and net change, with "No expenses or refunds in this period." and "No financial movements in this period." instead of invented rows.
- Snapshot invariance: a downloaded file read again after correcting an entry, deleting another, and renaming and archiving its category is byte-for-byte the same document, still naming `Groceries` and the deleted movement. A new export then reports the corrected amount under the new label `Food and home` and one remaining movement.
- Authorization: an export request without a session is refused with JSON and status 401, and a stranger's Google identity never becomes a session, so it is refused the same way. Neither reply carries journal text. An unresolvable period (`?kind=quarter`) is refused with 400 before anything is read.
- Failure handling: an export that cannot be delivered reports "The PDF could not be created, and your journal is unchanged. Retry the export." with a retry control, leaves the journal unchanged, and succeeds on retry. A refusal reports what the server said, so an expired session reads as required access rather than a failed rendering.
- Privacy: no public link, no hosted copy, no export-history page, and no synchronization exist. The reply carries `Cache-Control: private, no-store` and the document only ever exists in that reply.
- A generated four-page artifact was rendered to images and read page by page: headings, aligned amounts, wrapped notes, repeated column headings, and page numbers are legible, and the last page ends the list cleanly. Phone and desktop screenshots of the export control were inspected, with no horizontal overflow at either viewport. Artifacts are generated under ignored `test-results/`.

## Code review

Reviewed against starting commit `9a79bf3`, using independent Standards and Spec reviewers.

### Standards

No documented-standard violations. Findings resolved: the report and its export now resolve a requested period through one shared `requestedPeriod`, so both routes refuse an unresolvable one in the same words; a single `row` helper draws totals, breakdown groups, column headings, and movements instead of repeating the same cursor arithmetic; the layout constants are named; the page-headings flag says what it holds; and the export date is named where it is used rather than read as the current day. The substitution of characters the report's fonts cannot write is now stated in README.md and covers the whole WinAnsi range instead of a subset of it.

### Spec

Three findings resolved, one accepted as recorded.

- A row taller than one page was drawn past the foot of the page, so the tail of a note near the 2,000-character limit was lost. Rows now continue line by line onto the next page, with the column headings repeated, and a new scenario pins a 2,000-character note read back whole and in order.
- A refused export reported itself as a failed rendering. The server's own message is now shown, so an expired session says that access is required, and a scenario covers it.
- The object URL backing the download was released in the same task as the click, which cancels the download in some browsers. It is released later instead.
- The verification evidence for this issue is this document, committed with the change.

Live deployment verification remains outside this change, as recorded below.

## Deployment

No migration accompanies this change. Apply the existing migrations with `pnpm db:migrate` if the target database is behind; builds and application startup do not run migrations. No production data was read or modified for tests.

Live Neon and Google verification and production deployment were not performed for this change. Use a suitable preview database and a real authorized Google account for the deployment smoke test in README.md, and additionally export a day, a week, and a month, open each downloaded PDF, and confirm the export date, the covered period, and the totals against the overview on phone and desktop.
