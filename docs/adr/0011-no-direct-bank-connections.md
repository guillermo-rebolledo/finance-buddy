---
status: accepted
---

# Do not connect to banks; import owner-uploaded statements if automation is wanted

Finance Buddy records financial movements by hand, and it adds no direct bank connection, for three reasons:

- **No verified Mexican coverage.** None of the reviewed providers documents coverage of Mexican banks. GoCardless covers the EU and UK, and SimpleFIN covers the US and Canada. Goodbudget's sync is US-only, and Money Lover's covers parts of Asia. Mexican coverage for Wallet, Spendee and Toshl could not be verified, and Fintonic has reportedly stopped serving Mexico.
- **Third-party exposure.** An aggregator holds bank credentials or tokens and receives the whole transaction history. That contradicts the private, owner-only stance of ADR 0002.
- **Manual entry is the product.** Monefy, Bluecoins ("no bank login, ever"), Cashew and the Mexico-focused Vuallet ("no accede a tu banco ni pide tus claves") all market the same choice as a privacy benefit.

If automated input is wanted later, prefer **statement import**. The owner uploads a statement file exported from their bank, reviews the proposed financial movements, and only the rows they confirm are saved. A row that looks like an already-recorded movement is offered as a match rather than as a new entry. YNAB's file import is prior art: it matches a manual entry of the same amount within ten days and skips exact duplicates.

## Consequences for a statement import

- **Review before saving.** A statement credit might be income, a refund or a card repayment, and CONTEXT.md treats each differently. The owner classifies credits, and can skip transfer rows.
- **No double imports.** Re-importing the same or an overlapping statement must never save a row twice. Confirmed rows keep a fingerprint, following the idea behind idempotent entry ids, and genuinely identical rows are left to the owner's review.
- **Foreign-currency matches.** A card statement shows the peso charge. It is matched against a foreign-currency entry's converted amount, and the charged amount in ADR 0007 makes that match exact.
- **Unchanged rules.** Statement files are parsed and discarded, not stored. Owner scoping, active-category rules and refund arithmetic stay as they are.

## Not the journal export

This is separate from exporting and importing the whole journal in Finance Buddy's own format, which is being specified separately. That format round-trips Finance Buddy's own movements with their ids, kinds and categories. A bank statement carries none of those, so it always needs review.
