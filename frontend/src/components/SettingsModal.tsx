import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { AppData } from "../api/types";
import { useBootstrap } from "../api/hooks";
import { setLook, useLook, type Look } from "../utils/look";
import { clearTheme, getStoredTheme, setTheme, type ThemeChoice } from "../utils/theme";
import { setSidebarPinned, useSidebarPinned } from "../utils/sidebarPin";
import {
  disableReminders,
  enableReminders,
  partnerNewsEnabled,
  remindersEnabled,
  setPartnerNewsEnabled,
} from "../utils/notifications";
import { ALLDAY_DEFAULT_OPTIONS, TIMED_DEFAULT_OPTIONS, reminderDefaults, setReminderDefault } from "../utils/reminders";
import Select from "./Select";
import { activeSession, endSession, usingFirebase } from "../data/store";
import { disconnect, isNativeApp } from "../dropbox/auth";
import { DATA_PATH } from "../dropbox/store";
import { currentUser, signOut } from "../firebase/auth";
import { clearWidget } from "../native/widget";
import PartnerConnect from "./PartnerConnect";
import CalendarFeedsModal from "./CalendarFeedsModal";
import ImportModal from "./ImportModal";
import { useToast } from "./ToastProvider";
import { BellIcon, CalendarIcon, ImportIcon, LogOutIcon, PaperclipIcon, SettingsIcon, ShareIcon, XIcon } from "./icons";
import StorageSettings from "./StorageSettings";

type ThemeSetting = ThemeChoice | "system";
type Section = "appearance" | "sharing" | "calendars" | "reminders" | "storage" | "data" | "account";

const LOOKS: { id: Look; name: string; blurb: string }[] = [
  {
    id: "soca",
    name: "Soča",
    blurb: "A Now / Next / Later home, a command bar (press /) and project chips.",
  },
  {
    id: "classic",
    name: "Classic",
    blurb: "Sidebar on the left, Today, Upcoming and projects as lists.",
  },
];

/** Saves everything as one JSON file -- the same format the Dropbox storage used. */
function downloadBackup(data: AppData) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { calendarEvents: _events, me: _me, partner: _partner, ...rest } = data;
  const blob = new Blob([JSON.stringify(rest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opravilko-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Everything that isn't a task: the app's look, sharing, calendar feeds,
 * reminders, import/backup and the account. Sections down the side on wider
 * screens, a row of tabs on phones.
 */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const firebase = usingFirebase();
  const [section, setSection] = useState<Section>("appearance");
  const sections: { id: Section; label: string; icon: ReactNode }[] = [
    { id: "appearance", label: "Appearance", icon: <SettingsIcon width={16} height={16} /> },
    ...(firebase ? [{ id: "sharing" as const, label: "Sharing", icon: <ShareIcon width={16} height={16} /> }] : []),
    { id: "calendars", label: "Calendars", icon: <CalendarIcon width={16} height={16} /> },
    { id: "reminders", label: "Reminders", icon: <BellIcon width={16} height={16} /> },
    ...(firebase ? [{ id: "storage" as const, label: "Storage", icon: <PaperclipIcon width={16} height={16} /> }] : []),
    { id: "data", label: "Import & backup", icon: <ImportIcon width={16} height={16} /> },
    { id: "account", label: "Account", icon: <LogOutIcon width={16} height={16} /> },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="settings-head">
          <h3>Settings</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close settings">
            <XIcon width={18} height={18} />
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {sections.map((s) => (
              <button
                key={s.id}
                className={section === s.id ? "active" : ""}
                aria-current={section === s.id ? "page" : undefined}
                onClick={() => setSection(s.id)}
              >
                {s.icon}
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-panel">
            {section === "appearance" && <Appearance />}
            {section === "sharing" && <Sharing />}
            {section === "calendars" && (
              <>
                <h4>Calendars</h4>
                <CalendarFeedsModal embedded onClose={onClose} />
              </>
            )}
            {section === "reminders" && <Reminders />}
            {section === "storage" && <StorageSettings />}
            {section === "data" && <DataSection onClose={onClose} />}
            {section === "account" && <Account onClose={onClose} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Appearance() {
  const look = useLook();
  const pinned = useSidebarPinned(look);
  const [theme, setThemeState] = useState<ThemeSetting>(() => getStoredTheme() ?? "system");

  function pickTheme(next: ThemeSetting) {
    setThemeState(next);
    if (next === "system") clearTheme();
    else setTheme(next);
  }

  return (
    <>
      <h4>Look</h4>
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

      <h4>Theme</h4>
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {(["system", "light", "dark"] as const).map((t) => (
          <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "active" : ""} onClick={() => pickTheme(t)}>
            {t === "system" ? "Match device" : t === "light" ? "Light" : "Dark"}
          </button>
        ))}
      </div>

      <h4>Sidebar</h4>
      <label className="settings-switch">
        <input type="checkbox" checked={pinned} onChange={(e) => setSidebarPinned(look, e.target.checked)} />
        <span>
          <b>Keep the sidebar open</b>
          <span>Or let it slide away and open it from the ☰ button. Same as the pin at the top of the sidebar.</span>
        </span>
      </label>

      <p className="settings-note">Appearance is saved on this device only, so your phone and computer can differ.</p>
    </>
  );
}

function Sharing() {
  const { data } = useBootstrap();
  if (!data) return null;
  return (
    <>
      <h4>Partner (Midva)</h4>
      <p className="settings-note top">
        Tasks you switch to <b>Share</b> (or type <code>+midva</code>) go to your partner, and show up for both of you in
        Midva. Whole projects are shared from the project's ⋯ menu.
      </p>
      {data.partner ? (
        <div className="share-member">
          <span className="share-avatar" aria-hidden="true">
            {data.partner.photo ? <img src={data.partner.photo} alt="" referrerPolicy="no-referrer" /> : data.partner.name[0].toUpperCase()}
          </span>
          <span className="share-member-text">
            <b>{data.partner.name}</b>
            <span>{data.partner.email}</span>
          </span>
          <button className="btn btn-text" onClick={() => void activeSession()?.clearPartner()}>
            Disconnect
          </button>
        </div>
      ) : (
        <PartnerConnect compact />
      )}
      {data.partner && isNativeApp && <PartnerNewsSwitch name={data.partner.name.split(" ")[0]} />}
    </>
  );
}

/** App only: notifications when your partner adds to or ticks off your shared lists. */
function PartnerNewsSwitch({ name }: { name: string }) {
  const [on, setOn] = useState(partnerNewsEnabled);
  return (
    <>
      <h4>Notifications</h4>
      <label className="settings-switch">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setPartnerNewsEnabled(e.target.checked);
            setOn(e.target.checked);
          }}
        />
        <span>
          <b>Tell me what {name} adds or finishes</b>
          <span>
            For example "{name} added to Shopping: milk, eggs". Checked about every 15 minutes, also with the app
            closed; not while you're in the app.
          </span>
        </span>
      </label>
    </>
  );
}

function Reminders() {
  const showToast = useToast();
  const [on, setOn] = useState(remindersEnabled);
  const [defaults, setDefaults] = useState(reminderDefaults);
  const pickDefault = (kind: "timed" | "allDay", value: string) => {
    setReminderDefault(kind, value);
    setDefaults(reminderDefaults());
  };
  return (
    <>
      <h4>Reminders</h4>
      <p className="settings-note top">
        Add reminders to a task from its Reminders row, or while adding it. Your phone notifies you even when the app
        is closed, including for reminders you set here on the website.
      </p>
      <label className="settings-switch">
        <input
          type="checkbox"
          checked={on}
          onChange={async (e) => {
            if (!e.target.checked) {
              disableReminders();
              setOn(false);
              return;
            }
            const ok = await enableReminders();
            setOn(ok);
            if (!ok)
              showToast({
                message: isNativeApp
                  ? "Notifications are blocked. Allow them for Opravilko in Android's settings, then try again."
                  : "Your browser blocked notifications. Allow them in the site settings, then try again.",
              });
          }}
        />
        <span>
          <b>{isNativeApp ? "Notify me on this phone" : "Also notify me in this browser"}</b>
          <span>
            {isNativeApp
              ? "For the reminders you add, at their time."
              : "Only while a tab is open. Not needed for your phone to remind you."}
          </span>
        </span>
      </label>

      <h4>Default reminder for new tasks</h4>
      <div className="settings-pick">
        <span>Tasks with a time</span>
        <Select
          className="select"
          sheetTitle="Tasks with a time"
          value={defaults.timed}
          onChange={(e) => pickDefault("timed", e.target.value)}
        >
          {TIMED_DEFAULT_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="settings-pick">
        <span>All-day tasks</span>
        <Select
          className="select"
          sheetTitle="All-day tasks"
          value={defaults.allDay}
          onChange={(e) => pickDefault("allDay", e.target.value)}
        >
          {ALLDAY_DEFAULT_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <p className="settings-note">Added to new tasks with a date unless you pick reminders yourself. Saved on this device only.</p>
    </>
  );
}

function DataSection({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const firebase = usingFirebase();
  return (
    <>
      <h4>Backup</h4>
      <p className="settings-note top">
        Everything in one file: projects, tasks, labels, filters, calendars and history
        {firebase ? ", including older completed tasks." : "."} You can import it again on a first sign-in.
      </p>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // Older completed tasks aren't kept loaded with Firebase; fetch them first.
          if (firebase) await activeSession()?.loadArchived();
          const latest = queryClient.getQueryData<AppData>(["bootstrap"]);
          if (latest) downloadBackup(latest);
          setBusy(false);
        }}
      >
        {busy ? "Preparing…" : "Download backup"}
      </button>

      <h4>Import from Todoist</h4>
      <ImportModal embedded onClose={onClose} />
    </>
  );
}

function Account({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const firebase = usingFirebase();
  const user = currentUser();
  return (
    <>
      <h4>Account</h4>
      <div className="settings-account">
        {firebase ? (
          <>
            <b>{user?.displayName || user?.email}</b>
            <span>Signed in with Google{user?.email ? ` as ${user.email}` : ""}. Your tasks are stored in Firebase.</span>
          </>
        ) : (
          <>
            <b>Dropbox</b>
            <span>Your tasks are stored in your Dropbox, in {DATA_PATH}.</span>
          </>
        )}
      </div>
      <button
        className="btn btn-text settings-signout"
        onClick={async () => {
          onClose();
          if (firebase) {
            endSession();
            await signOut();
          } else {
            disconnect();
            clearWidget();
          }
          navigate("/connect", { replace: true });
        }}
      >
        <LogOutIcon width={15} height={15} /> {firebase ? "Sign out" : "Disconnect Dropbox"}
      </button>
    </>
  );
}
