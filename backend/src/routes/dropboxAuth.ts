import { Router } from "express";
import { makeAuth } from "../dropboxClient.js";

const router = Router();

// One-time setup flow: visit /api/auth/dropbox/connect, approve access in Dropbox,
// then copy the printed refresh token into DROPBOX_REFRESH_TOKEN.
router.get("/connect", async (req, res) => {
  try {
    const auth = makeAuth();
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/dropbox/callback`;
    const url = await auth.getAuthenticationUrl(
      redirectUri,
      undefined,
      "code",
      "offline",
      undefined,
      undefined,
      false
    );
    res.redirect(url.toString());
  } catch (err: any) {
    res.status(500).send(`Failed to start Dropbox auth: ${err?.message || err}`);
  }
});

router.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send("Missing ?code from Dropbox redirect.");
    return;
  }
  try {
    const auth = makeAuth();
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/dropbox/callback`;
    const response = await auth.getAccessTokenFromCode(redirectUri, code);
    const result: any = response.result;
    const refreshToken = result.refresh_token;
    res.send(`
      <html><body style="font-family: sans-serif; max-width: 640px; margin: 40px auto;">
        <h2>Dropbox connected</h2>
        <p>Copy this value into your backend's <code>DROPBOX_REFRESH_TOKEN</code> environment
        variable, then restart the server. This page will not show it again.</p>
        <pre style="background:#f4f4f4; padding:12px; border-radius:6px; word-break:break-all;">${refreshToken}</pre>
      </body></html>
    `);
  } catch (err: any) {
    res.status(500).send(`Failed to exchange code: ${err?.message || err}`);
  }
});

export default router;
