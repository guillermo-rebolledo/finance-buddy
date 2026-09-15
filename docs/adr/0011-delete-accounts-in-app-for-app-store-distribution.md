# Delete accounts in-app for App Store distribution

## Decision

Expose `DELETE /api/account` so the signed-in person can permanently delete their user identity and everything they own. This resolves the account-deletion consequence in ADR 0007 and applies to every verified user admitted under ADR 0009. It is additive: existing endpoints, fields, and refusal codes retain their meanings. Web Settings and native deletion controls are separate client work.

The endpoint uses the shared live-session authorization and request-integrity checks, including the minimum iOS build gate. Its body is optional; supplied bodies are JSON. Cookie requests require the configured Origin; signed bearer requests need no Origin.

## Provider grants before deletion

For each Apple sign-in account, revoke a supplied code's resulting token and every stored web refresh/access token. Without a code or stored token, refuse with `apple_authorization_required` (403). Exchange, configuration, identity mismatch, or revocation failures return `apple_revocation_failed` (503), retaining all local records. Apple authorization codes are opaque: the bearer deletion flow supplies a native bundle-ID code, and the cookie flow supplies a web Services-ID code. There is no cross-audience fallback. Check that the exchanged code belongs to the linked Apple account.

`APPLE_IOS_CLIENT_SECRET` has the bundle ID as its subject and is only meaningful alongside `APPLE_IOS_BUNDLE_ID`. Web grants use the Services ID and `APPLE_CLIENT_SECRET`. Both expiring JWTs require renewal. Native sign-in alone does not persist a revocable Apple token, so its client may need a fresh Apple authorization before deletion.

Then attempt to revoke all stored Google tokens, including the Sheets grant. Google failures are logged without credentials but do not block deletion. Each outbound request has a timeout. Apple revocation is a prerequisite for deletion; a transient Google outage should not prevent a person from removing their financial records.

## Permanent removal

One database transaction deletes the `user` row. Existing cascading foreign keys remove its sessions, sign-in accounts, category seeds, categories, financial movements, budgets and budget history, and spreadsheet export records. There is no soft deletion or grace period. Previously created export snapshots in Google Drive remain the person's files and are not deleted. Other users' records and sessions are unchanged.

Every old cookie and bearer session becomes unauthenticated. A later sign-in with the same provider identity creates a new user identity and an empty journal with starter categories.

## Trade-offs and verification

Provider calls and PostgreSQL cannot commit atomically. If a later revocation or database operation fails, an earlier provider grant may already be revoked even though local records remain. Retrying may require a fresh Apple code; a database outcome that cannot be confirmed returns the existing `not_confirmed` refusal. Deleting locally before revoking Apple would lose the stored tokens needed to finish revocation, so provider work comes first.

HTTP-boundary tests use real sessions and database cascades with controlled Apple and Google endpoints. They cover credentials for both audiences, blocked deletion retaining records, session invalidation, a fresh journal on return, and isolation. Real Apple registration and credentials still require deployment verification.

## References

- [Issue #60](https://github.com/guillermo-rebolledo/finance-buddy/issues/60)
- [Apple: handling account deletions and revoking tokens](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
- [Google: token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
