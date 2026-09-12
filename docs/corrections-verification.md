# Correct and permanently delete financial movements — issue #7

Verified locally September 11, 2026 with Node 24, pnpm 10.29.2, a production Next.js build, controlled Google responses, and disposable PostgreSQL 17.9 Alpine. No migration is needed; corrections and deletion reuse the existing `financial_movement` and `category` tables.

- Typechecking, ESLint, and the production build passed without production credentials.
- Full application suite: 82 cases passed, covering 41 scenarios on desktop Chromium and an iPhone 13 viewport.
- Every entry in the selected period carries Edit and Delete controls named after the entry itself, including historical, uncategorized, and refund entries, on both viewports.
- Editing reopens the form on the recorded type, amount, movement date, category, and note. Refused corrections (three decimal places, a future movement date) keep every field on screen, mark the field at fault, and leave the stored entry and its totals unchanged.
- A correction of amount, date, category, and note updates the entry, the totals, net change, and the category breakdown together: the day it left reports nothing and the day it entered reports all of it. The result survives a refresh and is identical in a second authenticated session.
- Archived categories: an entry keeps its archived category while another field changes, the form offers it as `Groceries (archived)` for that entry only, leaving the expense list clears it and returning offers it again, and once replaced it cannot be chosen back. Income categories, foreign categories, and unknown UUIDs are refused with a `categoryId` field error.
- Type changes: expense to refund keeps the shared expense category; changing to income clears it in the form and the server refuses an income category on an expense or refund, and an expense category on income. A refund corrected to income moves 450.00 out of expenses and into income with an empty breakdown.
- Deletion: the confirmation names the type, amount, movement date, and category. Keeping the entry changes nothing. Confirming removes it from the journal and from the day, week, and month totals at once, and repeating the deletion returns a field error without recreating it. Category records and unrelated movements stay intact.
- Refund inverses hold through corrections: a refund-only month reports total expenses -250.00 and net change +250.00, and negative periods are never clamped.
- Cross-month demonstration: a 1,200.00 card purchase on 2026-08-15 and a 200.00 refund on 2026-09-05, each corrected through the app. The purchase became 1,000.00 in August; the refund became 250.00 and moved into August. September then reports 0.00 across income, expenses, and net change with no entries, and August reports 750.00 total expenses with a single Groceries group of 750.00.
- Failure handling: a correction whose response is lost reports that it was not confirmed, keeps the form values, disables the fields, and offers one retry that writes the same values again rather than adding an entry. A failed deletion reports inside the open confirmation and the entry stays.
- Ownership: corrections and deletions aimed at another owner's entry or an unknown identifier return a field error, change nothing, and disclose nothing. Both require a live owner session, the configured Origin, and a JSON body.
- No trash, restore, post-confirmation undo, or user-visible edit history exists.
- Desktop and phone screenshots of the edit form and the delete confirmation were inspected. No horizontal overflow at either viewport. Screenshots are generated under ignored `test-results/`.

## Code review

Reviewed against starting commit `0a52eb4`, using independent Standards and Spec reviewers.

### Standards

No documented-standard violations. Maintainability findings resolved: the entry identifier rule is now stated once and shared by recording, correcting, and deleting; the success message reads from one outcome word instead of a nested cascade; the deletion in flight is named by what it holds; the confirmation no longer reads "in Uncategorized"; the archived-category explanation appears only when the category actually is archived; the test bodies start from one shared entry.

Two notes left as they are: `PATCH` and `DELETE` reply with the same body shape as a save, which no client reads, and the vendored `alert-dialog.tsx` delegates like every other file in `src/components/ui`.

### Spec

Three findings, two resolved and one rejected.

- An unconfirmed correction reused the wording written for recording, which told the owner not to create a replacement. Corrections now say the retry writes the same values again, and the server's own correction message is preferred when it arrives.
- The row's Delete control was pressable against a period mid-reload while Edit was not. Both are gated the same way now.
- The claim that nothing clears an incompatible category on a type change was rejected: the category field is keyed by movement type, so it remounts on every type change and reapplies the entry's own category only when the new type reads the same list. A test now pins the round trip, including for an archived category.

The requested failed-persistence coverage for corrections was added as a scenario of its own.

Standards: 6 findings resolved, no outstanding hard violations. Spec: 2 findings resolved, 1 rejected, no outstanding implementation findings.

## Deployment

No migration accompanies this change. Apply the existing migrations with `pnpm db:migrate` if the target database is behind; builds and application startup do not run migrations. No production data was read or modified for tests.

Live Neon and Google verification and production deployment were not performed for this change. Use a suitable preview database and a real authorized Google account for the deployment smoke test in README.md: record a purchase in one month and a refund in another, correct each through the app including a date change that crosses months, confirm both months after refresh, then delete an entry through the confirmation and confirm the day, week, and month totals, on phone and desktop.
