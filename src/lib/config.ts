import "server-only";
// An app build is one or more dot-separated whole numbers, the form an iOS
// bundle version takes, compared number by number: 12.1 is newer than 12 and
// older than 13.
export function appBuild(value: string) {
  return /^\d{1,9}(\.\d{1,9})*$/.test(value)
    ? value.split(".").map(Number)
    : null;
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
    APPLE_CLIENT_ID,
    APPLE_CLIENT_SECRET,
    APPLE_IOS_BUNDLE_ID,
    APPLE_IOS_CLIENT_SECRET,
    MINIMUM_IOS_BUILD,
  } = process.env;
  if (
    !DATABASE_URL ||
    !BETTER_AUTH_URL ||
    !BETTER_AUTH_SECRET ||
    BETTER_AUTH_SECRET.length < 32 ||
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_CLIENT_SECRET
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
      apple:
        APPLE_CLIENT_ID?.trim() && APPLE_CLIENT_SECRET?.trim()
          ? {
              // Keep the Services ID first for browser redirects; native ID
              // tokens may additionally name the explicitly configured app.
              clientId: [
                APPLE_CLIENT_ID.trim(),
                ...(APPLE_IOS_BUNDLE_ID?.trim()
                  ? [APPLE_IOS_BUNDLE_ID.trim()]
                  : []),
              ],
              clientSecret: APPLE_CLIENT_SECRET.trim(),
              iosClientSecret: APPLE_IOS_BUNDLE_ID?.trim()
                ? APPLE_IOS_CLIENT_SECRET?.trim() || undefined
                : undefined,
            }
          : undefined,
    };
  } catch {
    return null;
  }
}
