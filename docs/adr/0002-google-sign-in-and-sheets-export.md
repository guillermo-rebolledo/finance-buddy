# Use Google sign-in and include Google Sheets export in version one

Use Better Auth with Next.js and Google as the only sign-in provider for version one, with access restricted to the owner; a future public release remains a possibility. Include both human-readable PDF reports and direct export to Google Sheets from version one, creating a new spreadsheet in the connected Google account for each export. The owner chose the convenience of direct export over postponing integration in favor of a downloadable spreadsheet, accepting the additional Google authorization setup and connection handling; using Google for sign-in also keeps both workflows with one provider.

## Export behavior

PDF and Google Sheets exports are snapshots, not synchronized copies: later edits or deletions of financial movements do not update existing exports. Include the export date in the PDF filename and the Google Sheets spreadsheet title so the snapshot's generation date is visible; this date is distinct from the summary period being exported.

Both formats export the day, week, or month currently selected in the app, including that period's totals, category breakdown, and individual financial movements. Show the covered period and export date within the report as well as identifying the export date in its filename or spreadsheet title.

## Supporting references

Reviewed on September 11, 2026:

- [Better Auth's Google integration](https://better-auth.com/docs/authentication/google) supports Google sign-in and requesting additional permissions.
- [Google Sheets authorization scopes](https://developers.google.com/workspace/sheets/api/scopes) include the recommended non-sensitive `drive.file` scope for access to files used with the app.
- [Google Sheets API usage limits and pricing](https://developers.google.com/workspace/sheets/api/limits) state that standard usage within quotas has no additional cost; this does not describe hosting or database costs.
