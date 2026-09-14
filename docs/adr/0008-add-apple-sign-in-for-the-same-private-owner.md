# Add Apple sign-in for the same private owner

The owner requested Sign in with Apple alongside Google, with local and production setup instructions. This supersedes the Google-only provider restriction in ADRs 0002 and 0007. Apple is optional and uses the existing Better Auth database and cookie/bearer sessions.

Both providers must supply a verified email matching `PRIVATE_OWNER_EMAIL`. Accounts with that email link to the same user ID so either provider reaches the existing journal. Different emails, including Apple's private relay addresses, remain refused. Google configuration and the separate Google Sheets grant remain required as before; Apple sign-in grants no Google scopes.

Apple's cross-site form POST is allowed only at `/api/auth/callback/apple`. Better Auth redirects it to its GET callback, where the original SameSite cookie and OAuth state are checked. Session cookie settings and request integrity for every other operation remain unchanged.

The backend optionally accepts Apple ID tokens for the configured iOS bundle ID as well as the web Services ID. It requires a nonce and uses the same signed bearer session contract as Google. No native UI is part of this repository change.

See [setup and verification](../apple-sign-in.md) for Apple Developer registration, HTTPS local testing, expiring client-secret generation, and Vercel configuration.
