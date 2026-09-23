import { useState } from "react";
import { setLook, useLook, type Look } from "../utils/look";
import { clearTheme, getStoredTheme, setTheme, type ThemeChoice } from "../utils/theme";
import { useBootstrap } from "../api/hooks";
import { activeSession } from "../data/store";
import PartnerConnect from "./PartnerConnect";

type ThemeSetting = ThemeChoice | "system";

const LOOKS: { id: Look; name: string; blurb: string }[] = [
  {
    id: "soca",
    name: "Soča",
    blurb: "New. No fixed sidebar: a Now / Next / Later home, a command bar (press /) and project chips.",
  },
  {
    id: "classic",
    name: "Classic",
    blurb: "The original layout: sidebar on the left, Today, Upcoming and projects as lists.",
  },
];

/** App settings that live on this device: the overall look and light/dark. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const look = useLook();
  const { data } = useBootstrap();
  const [theme, setThemeState] = useState<ThemeSetting>(() => getStoredTheme() ?? "system");

  function pickTheme(next: ThemeSetting) {
    setThemeState(next);
    if (next === "system") clearTheme();
    else setTheme(next);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <div className="settings-section-title">Look</div>
        <div className="look-options" role="radiogroup" aria-label="Look">
          {LOOKS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={look === l.id}
              className={`look-option ${look === l.id ? "is-selected" : ""}`}
              onClick={() => setLook(l.id)}
            >
              <span className={`look-preview look-preview-${l.id}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="look-option-text">
                <b>{l.name}</b>
                <span>{l.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="settings-section-title">Theme</div>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "active" : ""} onClick={() => pickTheme(t)}>
              {t === "system" ? "Match device" : t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>

        <p className="settings-note">Look and theme are saved on this device only, so your phone and computer can differ.</p>

        {data?.me && (
          <>
            <div className="settings-section-title" style={{ marginTop: 16 }}>
              Partner (Midva)
            </div>
            {data.partner ? (
              <div className="share-member">
                <span className="share-avatar" aria-hidden="true">
                  {data.partner.photo ? <img src={data.partner.photo} alt="" referrerPolicy="no-referrer" /> : data.partner.name[0].toUpperCase()}
                </span>
                <span className="share-member-text">
                  <b>{data.partner.name}</b>
                  <span>{data.partner.email} · tasks you switch to “Share” go to them</span>
                </span>
                <button className="btn btn-text" onClick={() => void activeSession()?.clearPartner()}>
                  Disconnect
                </button>
              </div>
            ) : (
              <PartnerConnect compact />
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
