import "server-only";
// An app build is one or more dot-separated whole numbers, the form an iOS
// bundle version takes, compared number by number: 12.1 is newer than 12 and
// older than 13.
export function appBuild(value: string) {
  return /^\d{1,9}(\.\d{1,9})*$/.test(value) ? value.split(".").map(Number) : null;
}
export function buildAtLeast(build: number[], minimum: number[]) {
  for (let i = 0; i < Math.max(build.length, minimum.length); i++) {
    const difference = (build[i] ?? 0) - (minimum[i] ?? 0);
    if (difference) return difference > 0;
  }
  return true;
}
export function getConfig() {
  const {
    DATABASE_URL,
    BETTER_AUTH_URL,
    BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_IOS_CLIENT_ID,
    MINIMUM_IOS_BUILD,
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
    const minimumIosBuild = MINIMUM_IOS_BUILD?.trim()
      ? appBuild(MINIMUM_IOS_BUILD.trim())
      : undefined;
    if (minimumIosBuild === null) return null;
    return {
      minimumIosBuild,
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
