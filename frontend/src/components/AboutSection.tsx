import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { App } from "@capacitor/app";
import { isNativeApp } from "../dropbox/auth";
import { RELEASES } from "../data/releases";

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
