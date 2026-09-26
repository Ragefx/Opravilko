import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { App } from "@capacitor/app";
import { isNativeApp } from "../dropbox/auth";
import { RELEASES } from "../data/releases";
import { installUpdate, latestBuild, type AppUpdate } from "../native/update";

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
      return format(parseISO(__BUILD_TIME__), "d MMM yyyy, HH:mm");
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
              ? `Android app · build ${installed ?? latest.build}`
              : `Website · latest Android app is build ${latest.build}`}
          </span>
          <span className="about-meta">
            {built && `Built ${built}`}
            {__COMMIT__ && ` · ${__COMMIT__}`}
          </span>
        </div>
      </div>
      {isNativeApp && (
        <div className="about-update">
          {check.state === "found" ? (
            <button className="btn btn-primary" onClick={() => void updateNow(check.update)}>
              Update to build {check.update.build}
            </button>
          ) : (
            <button className="btn btn-secondary" disabled={check.state === "checking" || check.state === "downloading"} onClick={() => void checkNow()}>
              {check.state === "checking" ? "Checking…" : "Check for updates"}
            </button>
          )}
          <span>
            {check.state === "current" && "You have the newest build."}
            {check.state === "offline" && "Couldn't reach GitHub. Try again later."}
            {check.state === "found" && "Tap it, then Install."}
            {check.state === "downloading" && `Downloading… ${check.percent ?? 0}%`}
            {check.state === "permission" && "Allow Opravilko to install apps, then check again."}
            {check.state === "failed" && "The download didn't work. Try again?"}
          </span>
        </div>
      )}
      {!isNativeApp && (
        <p className="settings-note">
          The website updates by itself. The Android app:{" "}
          <a className="about-link" href={`${RELEASE_URL}${latest.build}`} target="_blank" rel="noreferrer">
            download build {latest.build}
          </a>
          .
        </p>
      )}

      <h4>What's new, build by build</h4>
      <div className="about-releases">
        {RELEASES.map((r, i) => (
          <details key={r.build} className="about-release" open={i < 3}>
            <summary>
              <b>Build {r.build}</b>
              <span>{format(parseISO(r.date), "d MMM yyyy")}</span>
              {installed === r.build && <em>installed</em>}
            </summary>
            <ul>
              {r.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}
