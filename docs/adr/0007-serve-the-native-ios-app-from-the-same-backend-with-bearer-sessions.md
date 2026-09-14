# Serve the native iOS app from the same backend with bearer sessions

The owner wants a native iOS app for the same journal. Serve it from this Next.js backend, its PostgreSQL database and its deployment rather than from a separate API, so the rules for financial movements, categories, summaries, trends and export snapshots stay in one place and both clients describe the same records. The app signs in with Google Sign-In for iOS and presents the resulting Google ID token, with the nonce it was issued for, to Better Auth's existing social sign-in. The token is accepted for the web or the iOS client ID, and admission is exactly the web's private owner policy, so Google stays the only sign-in provider (ADR 0002) and Neon PostgreSQL stays the only store (ADR 0003).

## Sessions

The app holds an ordinary database session, presented as a bearer token through Better Auth's bearer plugin. Only the signed form of the token is accepted, so the raw token stored in a session row is not enough on its own, and a request presenting a bearer token is judged by that token alone, never by a cookie sent with it. Browsers keep their session in the HTTP-only cookie and never receive the token. Bearer sessions expire and refresh exactly as cookie sessions do, signing out in the app deletes that session alone, and **Sign out everywhere** in Settings is the one remote control for a lost or stolen phone.

## Request integrity

Integrity depends on how a session was proven rather than on the Origin header alone. A present Origin must be this app's, however a request is authenticated. A write carrying the session cookie must name that Origin, because a browser attaches cookies to other sites' requests too; a write authenticated by a bearer token needs none, because only the client holding the token attaches it and a native client has no origin to send. No CORS headers are added.

## Compatibility

Installed app builds lag behind deployments, so the API only ever gains optional fields and new endpoints; nothing existing is renamed, removed, or changed in meaning, clients ignore fields they do not know, and a change that cannot follow this rule gets a new endpoint rather than a path version prefix. Every refusal carries a stable code beside its message, so a client never branches on wording. The app names its build on every request, and `MINIMUM_IOS_BUILD` lets the server ask a build too old for the current contract to update before it reads or writes anything.

## What stays on the web

Connecting Google Sheets export, which grants `drive.file`, stays on the web dashboard; the app exports with the web's grant and sends the owner to the web when it has to be granted again. Summary periods stay decided by the server's Mexico City calendar, so the app renders the boundaries it is given rather than computing them on the device. Offline synchronization, push notifications, and sign-in providers other than Google are not part of this decision.

## Consequences

One backend serving two clients makes the additive-only rule binding on every later change, including the open specs, which gain bearer access, request integrity and refusal codes through the same shared authorization step. Distributing the app through the App Store would require an equivalent privacy-focused sign-in, such as Sign in with Apple, and in-app account deletion, which would reopen ADR 0002; private distribution through TestFlight or development builds does not. The production origin is embedded in each app build, so it should be a stable custom domain.

## References

- [Better Auth bearer plugin](https://better-auth.com/docs/plugins/bearer)
- [Better Auth Google sign-in with an ID token](https://better-auth.com/docs/authentication/google)
- [Google Sign-In for iOS](https://developers.google.com/identity/sign-in/ios)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
