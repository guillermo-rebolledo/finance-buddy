import "server-only";
export function getConfig() {
  const {
    DATABASE_URL,
    BETTER_AUTH_URL,
    BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_IOS_CLIENT_ID,
    PRIVATE_OWNER_EMAIL,
  } = process.env;
  if (
    !DATABASE_URL ||
    !BETTER_AUTH_URL ||
    !BETTER_AUTH_SECRET ||
    BETTER_AUTH_SECRET.length < 32 ||
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_CLIENT_SECRET ||
    !PRIVATE_OWNER_EMAIL
  )
    return null;
  try {
    const origin = new URL(BETTER_AUTH_URL);
    const database = new URL(DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(database.protocol)) return null;
    if (
      origin.origin !== BETTER_AUTH_URL ||
      (origin.protocol !== "https:" &&
        !(
          origin.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(origin.hostname) &&
          !process.env.VERCEL
        ))
    )
      return null;
    const ownerEmail = PRIVATE_OWNER_EMAIL.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return null;
    return {
      databaseURL: DATABASE_URL,
      origin: origin.origin,
      secret: BETTER_AUTH_SECRET,
      // The web client comes first: Google's redirect sign-in uses it. The
      // iOS client, when configured, is only accepted as an ID token audience.
      googleClientIds: [
        GOOGLE_CLIENT_ID,
        ...(GOOGLE_IOS_CLIENT_ID?.trim() ? [GOOGLE_IOS_CLIENT_ID.trim()] : []),
      ],
      googleClientSecret: GOOGLE_CLIENT_SECRET,
      ownerEmail,
    };
  } catch {
    return null;
  }
}
