---
status: accepted
---

# Postpone receipt attachments

Several reference apps keep receipts with entries. Money Manager has Photo Save, Toshl Pro allows up to four attachments per entry, and Spendee, Money Lover and Vuallet scan a photo into a new entry. Attachments are postponed. The journal does not need them to produce correct totals, and they would bring a storage vendor, a retention policy, and the most sensitive data the app would hold.

## If attachments are adopted

- **Ownership.** An attachment belongs to exactly one financial movement and has no life of its own. Correcting the movement leaves the attachment in place. Deleting the movement deletes its attachments too, because deletion is permanent, with no trash or restore.
- **Storage.** Files are stored privately in object storage, outside PostgreSQL, and are served only through owner-authorized requests that return short-lived links. Images would quickly use up the Neon plan limits accepted in ADR 0003.
- **Export snapshots.** Snapshots do not embed attachments. A PDF or Google Sheets snapshot copies figures, and embedding receipts would copy private images into files outside the app, including the owner's Google Drive. A snapshot may note that a movement has an attachment.
- **Retries.** Each upload carries its own identifier, so retrying it never creates a duplicate. A movement already saved under its idempotent entry id stays valid if the upload fails.
- **OCR and AI extraction.** These are excluded. They would send receipt images to another service and replace the owner's manual entry with a guess the owner then has to check.
- **Unaffected.** Totals, refund arithmetic, transfers, categories and archiving are unchanged. A refund may carry its own receipt like any other movement.

## Trade-offs

Object storage would be a second hosted dependency alongside Neon, and file references tie the data to that vendor. Changing providers means migrating every file, and deletion has to stay consistent across two systems.

Receipts also expose more than the journal does: merchant addresses, partial card numbers and, on Mexican invoices, tax identifiers. A leaked or orphaned file reveals far more than an amount and a note. Owner-only access (ADR 0002) would have to protect the storage as strictly as the database.
