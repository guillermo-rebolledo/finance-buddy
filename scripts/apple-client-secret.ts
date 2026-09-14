import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";

async function main() {
  const {
    APPLE_CLIENT_ID,
    APPLE_TEAM_ID,
    APPLE_KEY_ID,
    APPLE_PRIVATE_KEY_PATH,
  } = process.env;
  if (
    ![
      APPLE_CLIENT_ID,
      APPLE_TEAM_ID,
      APPLE_KEY_ID,
      APPLE_PRIVATE_KEY_PATH,
    ].every((value) => value?.trim())
  )
    throw new Error(
      "Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY_PATH. See docs/apple-sign-in.md.",
    );
  const key = await importPKCS8(
    await readFile(APPLE_PRIVATE_KEY_PATH!, "utf8"),
    "ES256",
  );
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 180 * 24 * 60 * 60;
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: APPLE_KEY_ID!.trim() })
    .setIssuer(APPLE_TEAM_ID!.trim())
    .setSubject(APPLE_CLIENT_ID!.trim())
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(expires)
    .sign(key);
  console.error(
    `Apple client secret expires ${new Date(expires * 1000).toISOString()}. Replace it and redeploy before then.`,
  );
  console.log(secret);
}

main().catch(() => {
  console.error(
    "Could not generate the Apple client secret. Check APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and the readable ES256 .p8 file at APPLE_PRIVATE_KEY_PATH. See docs/apple-sign-in.md.",
  );
  process.exitCode = 1;
});
