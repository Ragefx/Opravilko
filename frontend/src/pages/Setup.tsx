import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { AppData } from "../api/types";
import { useBootstrap } from "../api/hooks";
import { activeSession, needsSetup, usingFirebase } from "../data/store";
import { isConnected as dropboxConnected, startConnect } from "../dropbox/auth";
import { fetchAppData as fetchDropboxFile } from "../dropbox/store";
import { currentUser } from "../firebase/auth";

function looksLikeAppData(x: any): x is AppData {
  return x && Array.isArray(x.tasks) && Array.isArray(x.projects);
}

/**
 * First sign-in with Google: bring the tasks over from the Dropbox file (or
 * a backup file), or start with an empty list.
 */
export default function Setup() {
  const navigate = useNavigate();
  const { data, isLoading, error: loadError } = useBootstrap();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!usingFirebase()) return <Navigate to="/connect" replace />;
  if (loadError)
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Opravilko</h1>
          <div className="login-error">Couldn't load your data: {(loadError as Error).message}</div>
        </div>
      </div>
    );
  if (isLoading || !data) return null;
  if (!needsSetup() && !busy) return <Navigate to="/app" replace />;

  const name = currentUser()?.displayName?.split(" ")[0] || "there";

  async function importData(source: string, load: () => Promise<AppData>) {
    setError(null);
    setBusy(source);
    try {
      const imported = await load();
      if (!looksLikeAppData(imported)) throw new Error("That file doesn't look like Opravilko data.");
      await activeSession()!.importAll(imported);
      navigate("/app", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Import failed.");
      setBusy(null);
    }
  }

  async function startFresh() {
    setBusy("fresh");
    await activeSession()!.markSetupDone();
    navigate("/app", { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-card setup-card">
        <h1>Welcome, {name}</h1>
        <p>Your tasks now sync through your Google account. Where should we start?</p>
        {error && <div className="login-error">{error}</div>}

        <div className="setup-options">
          <div className="setup-option">
            <b>Bring over my Dropbox tasks</b>
            <span>Copies everything from your Opravilko file in Dropbox: projects, tasks, labels, filters, calendars and history.</span>
            {dropboxConnected() ? (
              <button className="btn btn-primary" disabled={busy !== null} onClick={() => importData("dropbox", fetchDropboxFile)}>
                {busy === "dropbox" ? "Importing…" : "Import from Dropbox"}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy !== null} onClick={() => void startConnect()}>
                Connect Dropbox to import
              </button>
            )}
          </div>

          <div className="setup-option">
            <b>Import a backup file</b>
            <span>A .json backup downloaded from Opravilko (or the file from your Dropbox).</span>
            <button className="btn btn-text" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              {busy === "file" ? "Importing…" : "Choose file…"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importData("file", async () => JSON.parse(await file.text()));
                e.target.value = "";
              }}
            />
          </div>

          <div className="setup-option">
            <b>Start fresh</b>
            <span>An empty Inbox. Good if someone has shared projects with you.</span>
            <button className="btn btn-text" disabled={busy !== null} onClick={() => void startFresh()}>
              Start with an empty list
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
