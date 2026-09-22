import { useState } from "react";
import { isNativeApp, startConnect } from "../dropbox/auth";

export default function Connect({ initialError = null }: { initialError?: string | null }) {
  const [error, setError] = useState<string | null>(initialError);
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      await startConnect();
      // In the app, sign-in continues in the browser and returns via a deep
      // link; don't leave the button stuck if the user backs out of it.
      if (isNativeApp) setConnecting(false);
    } catch (err: any) {
      setError(err?.message || "Failed to start Dropbox connection.");
      setConnecting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Opravilko</h1>
        <p>Your tasks, stored in your own Dropbox.</p>
        {error && <div className="login-error">{error}</div>}
        <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
          {connecting ? "Redirecting to Dropbox..." : "Connect to Dropbox"}
        </button>
      </div>
    </div>
  );
}
