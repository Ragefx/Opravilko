import { tr } from "../i18n";
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
          <div className="login-error">
            {tr("Couldn't load your data: ", "Podatkov ni bilo mogoče naložiti: ")}
            {(loadError as Error).message}
          </div>
        </div>
      </div>
    );
  if (isLoading || !data) return null;
  if (!needsSetup() && !busy) return <Navigate to="/app" replace />;

  const name = currentUser()?.displayName?.split(" ")[0] || "";

  async function importData(source: string, load: () => Promise<AppData>) {
    setError(null);
    setBusy(source);
    try {
      const imported = await load();
      if (!looksLikeAppData(imported)) throw new Error(tr("That file doesn't look like Opravilko data.", "Ta datoteka ni videti kot podatki Opravilka."));
      await activeSession()!.importAll(imported);
      navigate("/app", { replace: true });
    } catch (err: any) {
      setError(err?.message || tr("Import failed.", "Uvoz ni uspel."));
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
        <h1>{name ? tr(`Welcome, ${name}`, `Dobrodošel/a, ${name}`) : tr("Welcome", "Dobrodošel/a")}</h1>
        <p>{tr("Your tasks now sync through your Google account. Where should we start?", "Naloge se zdaj usklajujejo prek tvojega Google računa. Kje začnemo?")}</p>
        {error && <div className="login-error">{error}</div>}

        <div className="setup-options">
          <div className="setup-option">
            <b>{tr("Bring over my Dropbox tasks", "Prenesi moje naloge iz Dropboxa")}</b>
            <span>
              {tr("Copies everything from your Opravilko file in Dropbox: projects, tasks, labels, filters, calendars and history.", "Kopira vse iz tvoje datoteke Opravilko v Dropboxu: projekte, naloge, oznake, filtre, koledarje in zgodovino.")}
            </span>
            {dropboxConnected() ? (
              <button className="btn btn-primary" disabled={busy !== null} onClick={() => importData("dropbox", fetchDropboxFile)}>
                {busy === "dropbox" ? tr("Importing…", "Uvažam …") : tr("Import from Dropbox", "Uvozi iz Dropboxa")}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy !== null} onClick={() => void startConnect()}>
                {tr("Connect Dropbox to import", "Poveži Dropbox za uvoz")}
              </button>
            )}
          </div>

          <div className="setup-option">
            <b>{tr("Import a backup file", "Uvozi varnostno kopijo")}</b>
            <span>{tr("A .json backup downloaded from Opravilko (or the file from your Dropbox).", "Kopija .json, prenesena iz Opravilka (ali datoteka iz tvojega Dropboxa).")}</span>
            <button className="btn btn-text" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              {busy === "file" ? tr("Importing…", "Uvažam …") : tr("Choose file…", "Izberi datoteko …")}
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
            <b>{tr("Start fresh", "Začni na novo")}</b>
            <span>{tr("An empty Inbox. Good if someone has shared projects with you.", "Prazen Prejeto. Dobro, če je kdo s tabo že delil projekte.")}</span>
            <button className="btn btn-text" disabled={busy !== null} onClick={() => void startFresh()}>
              {tr("Start with an empty list", "Začni s praznim seznamom")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
