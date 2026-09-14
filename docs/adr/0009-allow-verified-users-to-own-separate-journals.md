# Allow verified users to own separate journals

The user requested removal of the `PRIVATE_OWNER_EMAIL` restriction so any email can enter the app. This supersedes the private-launch email allowlist in ADRs 0002, 0007, and 0008. It applies equally to Google and Apple browser callbacks and native ID-token sign-in.

Admission requires a verified, nonempty email from a configured Google or Apple provider. Apple private relay addresses are accepted. `PRIVATE_OWNER_EMAIL` is neither required nor read; old values have no effect. Password sign-in and email/password registration stay disabled.

Records remain private to the authenticated Better Auth `user.id`. Existing identities retain their account and journal when they return, including when a provider changes their verified email. Matching verified emails can link Google and Apple to the same user; different emails remain separate accounts and cannot be explicitly linked. This means an Apple relay account cannot link a Google account with a different email for Google Sheets export.

Every protected request still checks a live, verified session. Journal, category, and export queries keep their existing user-ID scope; signing out everywhere revokes only that user's sessions. No database migration or ownership transfer is needed.

Existing login pages and authentication HTTP endpoints cover admission and session continuity. Public journal and export endpoints cover isolation between two authenticated users, including reads, attempted updates/deletes, and session revocation. Deployment must include this code; removing the old variable alone from an older deployment is insufficient.
