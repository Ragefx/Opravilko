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
        setError(err?.message || "Google sign-in failed.");
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
      setError(err?.message || "Failed to start Dropbox connection.");
      setConnecting(null);
    }
  }

  // Google sign-in inside the Android app needs a native plugin (not built yet),
  // so the app keeps using Dropbox for now.
  const offerGoogle = firebaseEnabled && !isNativeApp;

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Opravilko</h1>
        <p>{offerGoogle ? "Your tasks on all your devices, and shareable." : "Your tasks, stored in your own Dropbox."}</p>
        {error && <div className="login-error">{error}</div>}
        {offerGoogle && (
          <button className="btn btn-primary" onClick={handleGoogle} disabled={connecting !== null}>
            {connecting === "google" ? "Signing in…" : "Continue with Google"}
          </button>
        )}
        <button
          className={offerGoogle ? "btn btn-text login-secondary" : "btn btn-primary"}
          onClick={handleDropbox}
          disabled={connecting !== null}
        >
          {connecting === "dropbox" ? "Redirecting to Dropbox..." : offerGoogle ? "Use Dropbox storage instead" : "Connect to Dropbox"}
        </button>
      </div>
    </div>
  );
}
