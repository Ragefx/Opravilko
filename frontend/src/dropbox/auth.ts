import { Dropbox, DropboxAuth } from "dropbox";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

const APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY || "";

const LS_ACCESS_TOKEN = "opravilko.dbx.access_token";
const LS_ACCESS_EXPIRES = "opravilko.dbx.access_token_expires_at";
const LS_REFRESH_TOKEN = "opravilko.dbx.refresh_token";
const SS_CODE_VERIFIER = "opravilko.dbx.code_verifier";

/** True inside the Android app (Capacitor), false on the website. */
export const isNativeApp = Capacitor.isNativePlatform();

/** The public website, whose address is the redirect URI registered with Dropbox. */
const WEB_URL = import.meta.env.VITE_WEB_URL || "https://ragefx.github.io/Opravilko/";

/** Marks a sign-in started from the app, so the website knows to hand the code back to it. */
export const NATIVE_OAUTH_STATE = "opravilko-app";

/** Deep link the website forwards the app's authorization code to (see AndroidManifest.xml). */
export const NATIVE_OAUTH_CALLBACK = "opravilko://oauth";

/**
 * The URL Dropbox redirects back to after the user approves access. The app
 * has no web address of its own, so it borrows the website's (already
 * registered with Dropbox), and the website forwards the code into the app.
 */
export function getRedirectUri(): string {
  return isNativeApp ? WEB_URL : `${window.location.origin}${import.meta.env.BASE_URL}`;
}

// The app's sign-in round-trips through the system browser, and Android may
// stop the app meanwhile, so its PKCE verifier has to outlive the session.
const verifierStore = (): Storage => (isNativeApp ? localStorage : sessionStorage);

export function isConnected(): boolean {
  return Boolean(localStorage.getItem(LS_REFRESH_TOKEN));
}

export function disconnect(): void {
  localStorage.removeItem(LS_ACCESS_TOKEN);
  localStorage.removeItem(LS_ACCESS_EXPIRES);
  localStorage.removeItem(LS_REFRESH_TOKEN);
}

function saveTokens(accessToken: string, expiresAt: number, refreshToken: string) {
  localStorage.setItem(LS_ACCESS_TOKEN, accessToken);
  localStorage.setItem(LS_ACCESS_EXPIRES, String(expiresAt));
  localStorage.setItem(LS_REFRESH_TOKEN, refreshToken);
}

/** Kicks off the Dropbox PKCE authorization flow by redirecting the browser to Dropbox. */
export async function startConnect(): Promise<void> {
  if (!APP_KEY) throw new Error("VITE_DROPBOX_APP_KEY is not set.");
  const auth = new DropboxAuth({ clientId: APP_KEY });
  const redirectUri = getRedirectUri();
  const authUrl = await auth.getAuthenticationUrl(
    redirectUri,
    isNativeApp ? NATIVE_OAUTH_STATE : undefined,
    "code",
    "offline",
    undefined,
    undefined,
    true // usePKCE
  );
  const verifier = auth.getCodeVerifier();
  verifierStore().setItem(SS_CODE_VERIFIER, verifier);
  if (isNativeApp) {
    await Browser.open({ url: authUrl.toString() });
  } else {
    window.location.assign(authUrl.toString());
  }
}

/** Completes the flow after Dropbox redirects back with ?code=... in the URL. */
export async function completeConnect(code: string): Promise<void> {
  const verifier = verifierStore().getItem(SS_CODE_VERIFIER);
  if (!verifier) {
    throw new Error("Missing PKCE verifier for this browser session. Please try connecting again.");
  }
  const auth = new DropboxAuth({ clientId: APP_KEY });
  auth.setCodeVerifier(verifier);
  const redirectUri = getRedirectUri();
  const response = await auth.getAccessTokenFromCode(redirectUri, code);
  const result = response.result as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
  };
  saveTokens(result.access_token, Date.now() + result.expires_in * 1000, result.refresh_token);
  verifierStore().removeItem(SS_CODE_VERIFIER);
}

async function ensureFreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem(LS_REFRESH_TOKEN);
  if (!refreshToken) throw new Error("Not connected to Dropbox yet.");

  const accessToken = localStorage.getItem(LS_ACCESS_TOKEN);
  const expiresAt = Number(localStorage.getItem(LS_ACCESS_EXPIRES) || 0);
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;

  const auth = new DropboxAuth({ clientId: APP_KEY, refreshToken });
  await auth.refreshAccessToken();
  const newAccessToken = auth.getAccessToken();
  const expiresDate = auth.getAccessTokenExpiresAt();
  saveTokens(newAccessToken, expiresDate.getTime(), refreshToken);
  return newAccessToken;
}

export async function getDropboxClient(): Promise<Dropbox> {
  const accessToken = await ensureFreshAccessToken();
  return new Dropbox({ accessToken });
}
