import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { onAppResume } from "../native/android";
import { checkForUpdate, installUpdate, type AppUpdate } from "../native/update";
import { isNativeApp } from "../dropbox/auth";

const CHECK_EVERY = 30 * 60_000;

/**
 * The app: a small card when a newer build is on GitHub, to install it in
 * one tap (Android then asks "Install?"). Checked on start and when the app
 * comes back, at most every half hour; "Later" hides it until the next build.
 */
export default function UpdateBanner() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [state, setState] = useState<"idle" | "downloading" | "permission" | "failed">("idle");
  const [percent, setPercent] = useState(0);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (!isNativeApp) return;
    const check = async () => {
      if (Date.now() - lastCheck.current < CHECK_EVERY) return;
      lastCheck.current = Date.now();
      const found = await checkForUpdate();
      let dismissed = 0;
      try {
        dismissed = Number(localStorage.getItem("opravilko.updateLater")) || 0;
      } catch {
        /* ignore */
      }
      if (found && found.build !== dismissed) setUpdate(found);
    };
    void check();
    return onAppResume(() => {
      // Coming back from Settings after allowing installs: ready to go.
      setState((s) => (s === "permission" ? "idle" : s));
      void check();
    });
  }, []);

  if (!update) return null;

  async function go() {
    if (!update) return;
    setState("downloading");
    setPercent(0);
    try {
      const result = await installUpdate(update, setPercent);
      setState(result === "permission" ? "permission" : "idle");
    } catch {
      setState("failed");
    }
  }

  function later() {
    try {
      localStorage.setItem("opravilko.updateLater", String(update!.build));
    } catch {
      /* ignore */
    }
    setUpdate(null);
  }

  return (
    <div className="update-banner" role="status">
      <span className="update-banner-icon" aria-hidden="true">
        ✨
      </span>
      <span className="update-banner-text">
        <b>{tr(`Build ${update.build} is ready`, `Različica ${update.build} je pripravljena`)}</b>
        <span>
          {state === "downloading"
            ? tr(`Downloading… ${percent}%`, `Prenašam … ${percent} %`)
            : state === "permission"
              ? tr("Allow Opravilko to install apps, then tap Update again.", "Dovoli Opravilku nameščanje aplikacij in znova tapni Posodobi.")
              : state === "failed"
                ? tr("Download didn't work. Try again?", "Prenos ni uspel. Poskusiš znova?")
                : tr("Tap Update, then Install.", "Tapni Posodobi, nato Namesti.")}
        </span>
      </span>
      {state !== "downloading" && (
        <>
          <button className="update-banner-later" onClick={later}>
            {tr("Later", "Pozneje")}
          </button>
          <button className="update-banner-go" onClick={() => void go()}>
            {tr("Update", "Posodobi")}
          </button>
        </>
      )}
    </div>
  );
}
