import { tr } from "../i18n";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isNativeApp, startConnect } from "../dropbox/auth";
import { firebaseEnabled } from "../firebase/config";
import { signInWithGoogle } from "../firebase/auth";

export default function Connect({ initialError = null }: { initialError?: string | null }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(initialError);
  const [connecting, setConnecting] = useState<"google" | "dropbox" | null>(null);

  async function handleGoogle() {
    setError(null);
    setConnecting("google");
    try {
      await signInWithGoogle();
      navigate("/app", { replace: true });
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
        setError(err?.message || tr("Google sign-in failed.", "Prijava z Googlom ni uspela."));
      }
      setConnecting(null);
    }
  }

  async function handleDropbox() {
    setError(null);
    setConnecting("dropbox");
    try {
      await startConnect();
      // In the app, sign-in continues in the browser and returns via a deep
      // link; don't leave the button stuck if the user backs out of it.
      if (isNativeApp) setConnecting(null);
    } catch (err: any) {
      setError(err?.message || tr("Failed to start Dropbox connection.", "Povezave z Dropboxom ni bilo mogoče začeti."));
      setConnecting(null);
    }
  }

  // Google sign-in works on the website and in the Android app (native
  // account picker); Dropbox stays as the older alternative.
  const offerGoogle = firebaseEnabled;

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Opravilko</h1>
        <p>
          {offerGoogle
            ? tr("Your tasks on all your devices, and shareable.", "Tvoje naloge na vseh napravah, tudi za deljenje.")
            : tr("Your tasks, stored in your own Dropbox.", "Tvoje naloge, shranjene v tvojem Dropboxu.")}
        </p>
        {error && <div className="login-error">{error}</div>}
        {offerGoogle && (
          <button className="btn btn-primary" onClick={handleGoogle} disabled={connecting !== null}>
            {connecting === "google" ? tr("Signing in…", "Prijavljam …") : tr("Continue with Google", "Nadaljuj z Googlom")}
          </button>
        )}
        <button
          className={offerGoogle ? "btn btn-text login-secondary" : "btn btn-primary"}
          onClick={handleDropbox}
          disabled={connecting !== null}
        >
          {connecting === "dropbox"
            ? tr("Redirecting to Dropbox…", "Preusmerjam na Dropbox …")
            : offerGoogle
              ? tr("Use Dropbox storage instead", "Raje uporabi Dropbox")
              : tr("Connect to Dropbox", "Poveži z Dropboxom")}
        </button>
      </div>
    </div>
  );
}
