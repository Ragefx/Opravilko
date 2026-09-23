import { useState } from "react";
import type { Partner } from "../api/types";
import { activeSession } from "../data/store";
import { ShareError } from "../firebase/sync";

/**
 * Connects your partner by email -- or, if someone already shared a task
 * with you, in one click. Used on the Midva page and in Settings.
 */
export default function PartnerConnect({ suggestion, compact }: { suggestion?: Partner; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = activeSession();
  if (!session) return null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ShareError ? err.message : "Couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`partner-connect ${compact ? "compact" : ""}`}>
      {!compact && (
        <>
          <b>Connect your partner</b>
          <span>
            Then any task can be shared with one switch. They need to have signed in to Opravilko once.
          </span>
        </>
      )}
      {suggestion && (
        <button className="btn btn-primary" disabled={busy} onClick={() => run(() => session.setPartnerProfile(suggestion))}>
          Connect {suggestion.name.split(" ")[0]} ({suggestion.email})
        </button>
      )}
      <form
        className="share-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void run(() => session.setPartner(email));
        }}
      >
        <input
          type="text"
          inputMode="email"
          autoComplete="email"
          placeholder="Their Google email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Partner's email"
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </form>
      {error && <div className="login-error">{error}</div>}
    </div>
  );
}
