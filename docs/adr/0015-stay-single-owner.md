---
status: accepted
---

# Keep Finance Buddy single-owner

Spendee's shared wallets, Wallet's groups, YNAB Together and Goodbudget's household sync all let several people record into one budget. Finance Buddy admits exactly one person:

- ADR 0002 restricts access to the owner.
- Every admitted identity must have a verified Google email matching the privately configured owner.
- Every financial movement and category is keyed by that owner's Better Auth user id.

Finance Buddy stays single-owner, and reconsiders sharing only together with a decision to release the app publicly, since both mean admitting people other than the configured owner.

Several accepted decisions assume a private personal journal: permanent deletion without history, Google Sheets exports into the owner's own Drive, and a preferred currency stored per owner. Figures can already be shared on purpose through a PDF or Google Sheets export snapshot, which is a copy and exposes nothing live. Sharing one Google account between people, which is Cashew's answer, is not recommended, because that credential also opens the owner's email and Drive.

## What sharing would change

- **Admission.** An invitation or membership list would replace the single configured owner, with its own rules for revoking access.
- **Ownership keys.** Movements and categories would belong to a shared journal instead of a user id. Every owner key, index and composite category reference would have to migrate. The preferred currency (ADR 0007) and any budgets would have to be set per journal or per person.
- **Authorization.** Every statement scoped to the owner would become scoped to membership, with rules for who may correct, delete, archive categories or change the preferred currency.
- **Per-person attribution.** Each financial movement would record who entered it and who last corrected it. Because deletion is permanent, one member deleting another's entry would likely need an audit trail.
- **Exports.** Snapshots would name the journal and the person who exported them, and Google Sheets exports would land in that person's Drive.
- **Unchanged.** Refund arithmetic, transfers staying out of totals, and archived-category semantics carry over. Idempotent entry ids are already unique per owner, so they would become unique per shared journal.
