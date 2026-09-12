"use client";
import { createAuthClient } from "better-auth/react";
// One browser client for every Better Auth call the app makes: signing in,
// signing out, and authorizing Google Sheets export.
export const authClient = createAuthClient();
