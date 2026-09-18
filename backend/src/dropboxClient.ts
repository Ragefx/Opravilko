import { Dropbox, DropboxAuth } from "dropbox";

const APP_KEY = process.env.DROPBOX_APP_KEY || "";
const APP_SECRET = process.env.DROPBOX_APP_SECRET || "";
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN || "";

if (!APP_KEY || !APP_SECRET) {
  console.warn(
    "[dropbox] DROPBOX_APP_KEY / DROPBOX_APP_SECRET are not set. Dropbox features will fail until configured."
  );
}

export function makeAuth(): DropboxAuth {
  return new DropboxAuth({
    clientId: APP_KEY,
    clientSecret: APP_SECRET,
  });
}

let cachedClient: Dropbox | null = null;

/**
 * Returns a Dropbox client authenticated with the long-lived refresh token.
 * The SDK transparently exchanges it for short-lived access tokens as needed.
 */
export function getDropboxClient(): Dropbox {
  if (!REFRESH_TOKEN) {
    throw new Error(
      "DROPBOX_REFRESH_TOKEN is not set. Complete the one-time /api/auth/dropbox/connect flow first."
    );
  }
  if (cachedClient) return cachedClient;

  const auth = makeAuth();
  auth.setRefreshToken(REFRESH_TOKEN);
  cachedClient = new Dropbox({ auth });
  return cachedClient;
}

export function isDropboxConfigured(): boolean {
  return Boolean(APP_KEY && APP_SECRET && REFRESH_TOKEN);
}
