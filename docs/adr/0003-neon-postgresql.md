# Store application data in Neon-hosted PostgreSQL

Use Neon-hosted PostgreSQL as the central database for financial movements, categories, and Better Auth data. Neon was chosen for its Vercel integration and available free plan, while PostgreSQL is supported by Better Auth and allows access to the same records across devices. This introduces a hosted database dependency and plan limits, accepted in exchange for avoiding database server administration for the personal application.

## Supporting references

Reviewed on September 11, 2026:

- [Vercel Marketplace storage integrations](https://vercel.com/docs/marketplace-storage).
- [Better Auth PostgreSQL support](https://better-auth.com/docs/adapters/postgresql).
- [Neon plans and pricing](https://neon.com/pricing). The initial target is the free plan.
