# Refunds that reduce expenses — issue #4

Verified locally September 11, 2026 with Node 24, pnpm 10.29.2, a production Next.js build, controlled Google responses, and disposable PostgreSQL 17.9 Alpine.

- Typechecking, ESLint, and the production build passed without production credentials.
- Full application suite: 44 cases passed, covering 22 scenarios on desktop Chromium and an iPhone 13 viewport.
- Refund coverage: a refund saved through the form with an expense category; income 10,000, expense 1,000, refund 200 reporting income 10,000, total expenses 800, and net change 9,200; an uncategorized refund of 100 reducing its own group to -100 while total expenses become 700; the breakdown summing exactly to total expenses.
- A refund-only week of 250 reports total expenses -250 and net change +250 with income 0. Negative group and total values render as written and are never clamped.
- A standalone refund needs no original purchase and no purchase identifier. A refund received the following week reduces only that week; the purchase week still reports 500.
- Refund category choices are limited to the owner's active expense categories. Income categories, archived expense categories, categories owned by another account, and unknown UUIDs are rejected with a `categoryId` field error. A rejected archived category stays archived; restoring it makes it selectable again.
- Existing income and expense behavior is unchanged, including validation, failed-input preservation, pending-submit protection, server-derived ownership, duplicate and concurrent requests, and a committed save whose response is lost.
- Entries name their type in text (`Refund · Groceries`) and present refunds as negative amounts with no reliance on color, and the owner never types a negative number.
- Desktop and phone screenshots of a mixed refund week were inspected. No horizontal overflow at either viewport. Screenshots are generated under ignored `test-results/`.

## Code review

Reviewed against starting commit `1fac78dbc77ae59cf541224ee012a5b3062605e5`, using independent Standards and Spec reviewers.

### Standards

Two documentation gaps and three maintainability findings, all resolved.

- README did not document the refund API contract, the new migration, or the refund step in the deployment smoke test. Updated.
- No verification record existed for this issue. This file is it.
- Movement-type dispatch was repeated as ad-hoc conditionals. Replaced with a single `entryKindDetails` descriptor per type (label, category list, period total, sign) that the report arithmetic, the amount presentation, and the form's type options all read from.
- The unchecked movement-type cast in the entries list was removed.
- Migration `0003_refunds.sql` now names the foreign key it adds instead of relying on a generated name.

### Spec

Two findings resolved, one rejected as out of scope.

- Net change for a refund-only period displayed `250` rather than `+250`. Positive net change now carries its sign; zero and negative values are unchanged.
- The archived-category hint pointed the owner at category management, which is issue #7 and does not exist yet. Reworded to state that an archived category stays archived and the refund can remain uncategorized.
- A future `transfer` type could have been silently classified as an expense. The report and the save path now read the explicit descriptor map, and the generated `category_kind` column maps each known type explicitly, so an unmapped type fails loudly instead of counting as spending. Adding `transfer` itself remains out of scope for this issue.

Standards: 5 findings resolved, no outstanding hard violations. Spec: 2 findings resolved, no outstanding implementation findings.

## Deployment

Apply `migrations/0003_refunds.sql` with `pnpm db:migrate` against the intended database before enabling this build. The migration widens the movement-type constraint, adds a stored `category_kind` column, and repoints the category foreign key so refunds use expense categories. Builds and application startup do not run migrations. No production data was read or modified for tests.

Live Neon and Google verification and production deployment were not performed for this change. Use a suitable preview database and a real authorized Google account for the deployment smoke test in README.md, recording a refund alongside income and an expense.
