import { useEffect, useState } from "react";
import { parseISO } from "date-fns";
import { tr, format, isSl } from "../i18n";
import { App } from "@capacitor/app";
import { isNativeApp } from "../dropbox/auth";
import { RELEASES } from "../data/releases";
import { installUpdate, latestBuild, type AppUpdate } from "../native/update";
import { clearErrors, loadErrors, type ErrorEntry } from "../utils/errorLog";
import { nudgeLog } from "../utils/helper";
import { nativePushLog } from "../native/widget";

const RELEASE_URL = "https://github.com/Ragefx/Opravilko/releases/tag/android-build-";

/** Settings > About: which version this is, and what every Android build brought. */
export default function AboutSection() {
  // The installed APK's build number (the workflow's run number).
  const [installed, setInstalled] = useState<number | null>(null);
  useEffect(() => {
    if (!isNativeApp) return;
    App.getInfo()
      .then((info) => setInstalled(Number(info.build) || null))
      .catch(() => setInstalled(null));
  }, []);
  const latest = RELEASES[0];
  // "Check for updates" (app only).
  const [check, setCheck] = useState<
    { state: "idle" | "checking" | "current" | "offline" | "permission" | "failed" } | { state: "found" | "downloading"; update: AppUpdate; percent?: number }
  >({ state: "idle" });
  async function checkNow() {
    setCheck({ state: "checking" });
    try {
      const found = await latestBuild();
      if (!found) setCheck({ state: "offline" });
      else if (installed && found.build > installed) setCheck({ state: "found", update: found });
      else setCheck({ state: "current" });
    } catch {
      setCheck({ state: "offline" });
    }
  }
  async function updateNow(update: AppUpdate) {
    setCheck({ state: "downloading", update, percent: 0 });
    try {
      const result = await installUpdate(update, (percent) => setCheck({ state: "downloading", update, percent }));
      setCheck(result === "permission" ? { state: "permission" } : { state: "found", update });
    } catch {
      setCheck({ state: "failed" });
    }
  }
  const built = (() => {
    try {
      return format(parseISO(__BUILD_TIME__), tr("d MMM yyyy, HH:mm", "d. MMM yyyy, HH:mm"));
    } catch {
      return "";
    }
  })();

  return (
    <>
      <div className="about-head">
        <span className="about-mark" aria-hidden="true">
          o<i>.</i>
        </span>
        <div>
          <b>Opravilko</b>
          <span>
            {isNativeApp
              ? tr(`Android app · build ${installed ?? latest.build}`, `Aplikacija za Android · različica ${installed ?? latest.build}`)
              : tr(`Website · latest Android app is build ${latest.build}`, `Spletna stran · zadnja aplikacija za Android je različica ${latest.build}`)}
          </span>
          <span className="about-meta">
            {built && tr(`Built ${built}`, `Zgrajeno ${built}`)}
            {__COMMIT__ && ` · ${__COMMIT__}`}
          </span>
        </div>
      </div>
      {isNativeApp && (
        <div className="about-update">
          {check.state === "found" ? (
            <button className="btn btn-primary" onClick={() => void updateNow(check.update)}>
              {tr(`Update to build ${check.update.build}`, `Posodobi na različico ${check.update.build}`)}
            </button>
          ) : (
            <button className="btn btn-secondary" disabled={check.state === "checking" || check.state === "downloading"} onClick={() => void checkNow()}>
              {check.state === "checking" ? tr("Checking…", "Preverjam …") : tr("Check for updates", "Preveri posodobitve")}
            </button>
          )}
          <span>
            {check.state === "current" && tr("You have the newest build.", "Imaš najnovejšo različico.")}
            {check.state === "offline" && tr("Couldn't reach GitHub. Try again later.", "GitHub ni dosegljiv. Poskusi pozneje.")}
            {check.state === "found" && tr("Tap it, then Install.", "Tapni ga, nato Namesti.")}
            {check.state === "downloading" && tr(`Downloading… ${check.percent ?? 0}%`, `Prenašam … ${check.percent ?? 0} %`)}
            {check.state === "permission" && tr("Allow Opravilko to install apps, then check again.", "Dovoli Opravilku nameščanje aplikacij in preveri znova.")}
            {check.state === "failed" && tr("The download didn't work. Try again?", "Prenos ni uspel. Poskusiš znova?")}
          </span>
        </div>
      )}
      {!isNativeApp && (
        <p className="settings-note">
          {tr("The website updates by itself. The Android app:", "Spletna stran se posodablja sama. Aplikacija za Android:")}{" "}
          <a className="about-link" href={`${RELEASE_URL}${latest.build}`} target="_blank" rel="noreferrer">
            {tr(`download build ${latest.build}`, `prenesi različico ${latest.build}`)}
          </a>
          .
        </p>
      )}

      <ErrorLog />
      <NudgeLog />

      <h4>{tr("What's new, build by build", "Kaj je novega, po različicah")}</h4>
      {isSl && <p className="settings-note top">Različice pred 56 so opisane le v angleščini.</p>}
      <div className="about-releases">
        {RELEASES.map((r, i) => (
          <details key={r.build} className="about-release" open={i < 3}>
            <summary>
              <b>{tr(`Build ${r.build}`, `Različica ${r.build}`)}</b>
              <span>{format(parseISO(r.date), tr("d MMM yyyy", "d. MMM yyyy"))}</span>
              {installed === r.build && <em>{tr("installed", "nameščena")}</em>}
            </summary>
            <ul>
              {(isSl && r.itemsSl ? r.itemsSl : r.items).map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}

/**
 * Instant updates: the nudges this device sent (from the app and, on the
 * phone, the widget) and received, newest first, to see where one got lost.
 */
function NudgeLog() {
  const [lines, setLines] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void nativePushLog().then((native) => {
      // Both logs start with "d.M. HH:mm:ss": merged, newest first.
      const key = (l: string) => {
        const m = /^(\d+)\.(\d+)\. (\d\d:\d\d:\d\d)/.exec(l);
        return m ? `${m[2].padStart(2, "0")}${m[1].padStart(2, "0")}${m[3]}` : "";
      };
      setLines([...native, ...nudgeLog()].sort((a, b) => key(b).localeCompare(key(a))).slice(0, 40));
    });
  }, []);
  if (!lines) return null;
  // On the phone it's always shown: an empty log says something too.
  if (!lines.length && !isNativeApp) return null;
  if (!lines.length) {
    return (
      <>
        <h4>{tr("Instant updates", "Takojšnje posodobitve")}</h4>
        <p className="settings-note">
          {tr(
            "Nothing yet: this phone hasn't registered for nudges, sent one or got one. Opening the app with the internet on registers it; if this stays empty, check that Google Play services are up to date.",
            "Še nič: ta telefon se še ni prijavil za obvestila, ni nobenega poslal ne prejel. Odpiranje aplikacije z vklopljenim internetom ga prijavi; če ostane prazno, preveri, ali so storitve Google Play posodobljene."
          )}
        </p>
      </>
    );
  }
  return (
    <>
      <h4>{tr("Instant updates", "Takojšnje posodobitve")}</h4>
      <p className="settings-note">
        {isNativeApp
          ? tr("What this phone sent to and got from the other phone lately.", "Kaj je ta telefon nedavno poslal drugemu telefonu in od njega prejel.")
          : tr("What this browser sent to and got from the other phone lately.", "Kaj je ta brskalnik nedavno poslal drugemu telefonu in od njega prejel.")}
      </p>
      <pre className="about-nudges">{lines.join("\n")}</pre>
      <div className="about-update">
        <button
          className="btn btn-secondary"
          onClick={() =>
            void navigator.clipboard.writeText(lines.join("\n")).then(
              () => setCopied(true),
              () => setCopied(false)
            )
          }
        >
          {copied ? tr("Copied", "Kopirano") : tr("Copy", "Kopiraj")}
        </button>
      </div>
    </>
  );
}

/** Errors the app hit lately (on any of your devices), to copy and send when something went wrong. */
function ErrorLog() {
  const [entries, setEntries] = useState<ErrorEntry[] | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void loadErrors().then(setEntries);
  }, []);
  if (!entries?.length) return null;
  const text = entries
    .map((e) => `${e.at} · ${e.device} · ${e.kind} · ${e.version} · ${e.page}\n${e.message}\n${e.stack}`)
    .join("\n\n");
  return (
    <>
      <h4>{tr("Problems", "Težave")}</h4>
      <p className="settings-note">
        {tr(
          "Errors the app ran into lately. If something went wrong, copy these and send them along; they say where it happened.",
          "Napake, na katere je aplikacija nedavno naletela. Če je šlo kaj narobe, jih kopiraj in pošlji; povedo, kje se je zgodilo."
        )}
      </p>
      <ul className="about-errors">
        {entries.slice(0, 5).map((e) => (
          <li key={e.id}>
            <b>{e.kind === "crash" ? tr("Crash", "Sesutje") : tr("Error", "Napaka")}</b> · {format(parseISO(e.at), tr("d MMM, HH:mm", "d. MMM, HH:mm"))} ·{" "}
            {e.device === "android" ? tr("phone", "telefon") : tr("website", "spletna stran")}
            <span>{e.message}</span>
          </li>
        ))}
      </ul>
      <div className="about-update">
        <button
          className="btn btn-secondary"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false)
            )
          }
        >
          {copied ? tr("Copied", "Kopirano") : tr(`Copy all (${entries.length})`, `Kopiraj vse (${entries.length})`)}
        </button>
        <button
          className="btn btn-text"
          onClick={() => {
            void clearErrors(entries);
            setEntries([]);
          }}
        >
          {tr("Clear", "Počisti")}
        </button>
      </div>
    </>
  );
}
