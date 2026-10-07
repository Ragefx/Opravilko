import { tr, trn, lang, setLang, isSl } from "../i18n";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { AppData } from "../api/types";
import { useBootstrap } from "../api/hooks";
import { setLook, useLook, type Look } from "../utils/look";
import { PALETTES, setPalette, usePalette } from "../utils/palette";
import { setAddStyle, useAddStyle, type AddStyle } from "../utils/addStyle";
import { setFocusCard, useFocusCard } from "../utils/focusCard";
import { setSwipeTasks, useSwipeTasks } from "../utils/swipeTasks";
import { SIMPLE_ITEMS, setSimple, setSimpleShown, useSimple } from "../utils/simple";
import { setWeeklyReview, useWeeklyReview } from "../utils/weeklyReview";
import { setHolidaysOn, useHolidays } from "../utils/holidays";
import { setCalendarDoneOn, useCalendarDone } from "../utils/calendarDone";
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
import { BellIcon, CalendarIcon, ChevronIcon, CouchIcon, ImportIcon, InfoIcon, LogOutIcon, PaperclipIcon, SettingsIcon, ShareIcon, XIcon } from "./icons";
import StorageSettings from "./StorageSettings";
import { hasGmailKey, makeGmailKey } from "../utils/gmailKey";
import AboutSection from "./AboutSection";
import { RELEASES } from "../data/releases";
import { useNarrowScreen } from "./MobileCalendar";
import { appUi } from "../utils/appUi";

type ThemeSetting = ThemeChoice | "system";
type Section = "simple" | "appearance" | "sharing" | "calendars" | "reminders" | "storage" | "data" | "account" | "about";

const LOOKS: { id: Look; name: string; blurb: string }[] = [
  {
    id: "soca",
    name: "Soča",
    blurb: tr("A Now / Next / Later home, a command bar (press /) and project chips.", "Začetna stran Zdaj / Naslednje / Pozneje, ukazna vrstica (tipka /) in projekti kot gumbi."),
  },
  {
    id: "classic",
    name: tr("Classic", "Klasičen"),
    blurb: tr("The sidebar on the left, projects as plain lists.", "Stranski meni na levi, projekti kot preprosti seznami."),
  },
];

const ADD_STYLES: { id: AddStyle; name: string; blurb: string }[] = [
  { id: "corner", name: tr("Corner button", "Gumb v kotu"), blurb: tr("Bottom right. Hold it for task, shopping item or voice.", "Spodaj desno. Pridrži ga za nalogo, nakup ali glas.") },
  { id: "tabs", name: tr("Bottom bar", "Spodnja vrstica"), blurb: tr("Now, Calendar, +, Shopping, Midva at the bottom; the chips row goes away.", "Zdaj, Koledar, +, Nakupi, Midva spodaj; vrstica z gumbi zgoraj izgine.") },
  { id: "bar", name: tr("Add bar", "Vrstica za dodajanje"), blurb: tr("An “Add a task…” bar at the bottom, with a mic for voice.", "Vrstica »Dodaj nalogo …« spodaj, z mikrofonom za glas.") },
  { id: "dot", name: tr("The dot", "Pika"), blurb: tr("The logo’s dot as the button. Swipe it left for shopping, up for voice.", "Pika iz logotipa kot gumb. Povleci levo za nakupe, gor za glas.") },
  { id: "top", name: tr("At the top", "Zgoraj"), blurb: tr("The + in the header, as before.", "+ v glavi, kot prej.") },
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
  const phone = useNarrowScreen() || appUi;
  const [pageOpen, setPageOpen] = useState(false);
  const go = (id: Section) => {
    setSection(id);
    setPageOpen(true);
  };
  const { data } = useBootstrap();
  const navigate = useNavigate();
  const look = useLook();
  const addStyle = useAddStyle();
  const focusOn = useFocusCard();
  const reviewOn = useWeeklyReview();
  const user = currentUser();
  const me = firebase
    ? { name: user?.displayName || user?.email || "", detail: user?.email ? `Google · ${user.email}` : tr("Signed in with Google", "Prijavljen z Googlom") }
    : { name: "Dropbox", detail: tr("Tasks stored in your Dropbox", "Naloge so shranjene v tvojem Dropboxu") };
  const theme = getStoredTheme();
  const palette = usePalette();
  const partnerName = data?.partner?.name.split(" ")[0];
  const feeds = data?.calendarFeeds?.length ?? 0;
  const simpleState = useSimple();
  const summaries: Partial<Record<Section, string>> = {
    simple: [
      simpleState.on
        ? `${tr("On", "Vklopljeno")} · ${trn(SIMPLE_ITEMS.length - simpleState.shown.length, ["# thing hidden", "# things hidden"], ["# stvar skrita", "# stvari skriti", "# stvari skrite", "# stvari skritih"])}`
        : tr("Off · hide the extras for a calmer app", "Izklopljeno · skrij dodatke za mirnejšo aplikacijo"),
      ...(focusOn ? [] : [tr("no focus task", "brez glavne naloge")]),
      ...(reviewOn ? [] : [tr("no weekly review", "brez tedenskega pregleda")]),
    ].join(" · "),
    appearance: [
      LOOKS.find((l) => l.id === look)?.name,
      ...(palette === "soca" ? [] : [PALETTES.find((p) => p.id === palette)?.name]),
      theme === "dark" ? tr("Dark", "Temno") : theme === "light" ? tr("Light", "Svetlo") : tr("Match device", "Kot naprava"),
      tr(`${ADD_STYLES.find((a) => a.id === addStyle)?.name ?? ""} add button`, `Gumb za dodajanje: ${ADD_STYLES.find((a) => a.id === addStyle)?.name ?? ""}`),
    ].join(" · "),
    sharing: partnerName ? tr(`With ${partnerName}`, `Z ${partnerName}`) : tr("Connect with your partner", "Poveži se s partnerjem"),
    calendars: feeds ? trn(feeds, ["# subscribed", "# subscribed"], ["# naročen", "# naročena", "# naročeni", "# naročenih"]) : tr("Holidays, birthdays, TV…", "Prazniki, rojstni dnevi, TV …"),
    reminders: tr("Defaults for new tasks", "Privzeto za nove naloge"),
    storage: tr("Photos and files on tasks", "Fotografije in datoteke na nalogah"),
    data: tr("Todoist import, backup file, Gmail add-on", "Uvoz iz Todoista, varnostna kopija, dodatek za Gmail"),
    about: tr(`Build ${RELEASES[0].build} · what's new`, `Različica ${RELEASES[0].build} · kaj je novega`),
  };
  const groups = ([
    { title: tr("Look & feel", "Videz in občutek"), ids: ["simple", "appearance"] },
    { title: tr("Together", "Skupaj"), ids: ["sharing"] },
    { title: tr("Tasks", "Naloge"), ids: ["reminders", "calendars"] },
    { title: tr("Data", "Podatki"), ids: ["storage", "data"] },
    { title: tr("App", "Aplikacija"), ids: ["about"] },
  ] as { title: string; ids: Section[] }[]).filter((g) => g.ids.some((id) => id !== "sharing" || firebase));
  async function signOutHere() {
    onClose();
    if (firebase) {
      endSession();
      await signOut();
    } else {
      disconnect();
      clearWidget();
    }
    navigate("/connect", { replace: true });
  }
  const sections: { id: Section; label: string; icon: ReactNode }[] = [
    { id: "simple", label: tr("Simple", "Preprosto"), icon: <CouchIcon width={16} height={16} /> },
    { id: "appearance", label: tr("Appearance", "Videz"), icon: <SettingsIcon width={16} height={16} /> },
    ...(firebase ? [{ id: "sharing" as const, label: tr("Sharing", "Deljenje"), icon: <ShareIcon width={16} height={16} /> }] : []),
    { id: "calendars", label: tr("Calendars", "Koledarji"), icon: <CalendarIcon width={16} height={16} /> },
    { id: "reminders", label: tr("Reminders", "Opomniki"), icon: <BellIcon width={16} height={16} /> },
    ...(firebase ? [{ id: "storage" as const, label: tr("Storage", "Prostor"), icon: <PaperclipIcon width={16} height={16} /> }] : []),
    { id: "data", label: tr("Import, backup & Gmail", "Uvoz, kopija in Gmail"), icon: <ImportIcon width={16} height={16} /> },
    { id: "account", label: tr("Account", "Račun"), icon: <LogOutIcon width={16} height={16} /> },
    { id: "about", label: tr("About", "O aplikaciji"), icon: <InfoIcon width={16} height={16} /> },
  ];

  const content = (id: Section) => (
    <>
      {id === "simple" && <SimpleSection />}
      {id === "appearance" && <Appearance />}
      {id === "sharing" && <Sharing />}
      {id === "calendars" && (
        <>
          {!phone && <h4>{tr("Calendars", "Koledarji")}</h4>}
          <CalendarFeedsModal embedded onClose={onClose} />
        </>
      )}
      {id === "reminders" && <Reminders />}
      {id === "storage" && <StorageSettings />}
      {id === "data" && <DataSection onClose={onClose} />}
      {id === "account" && <Account onClose={onClose} />}
      {id === "about" && <AboutSection />}
    </>
  );

  // The app (and phone-sized windows): a settings page -- you at the top,
  // grouped rows with what each is set to, Sign out at the bottom; a row
  // opens its page, and Back (or the arrow) returns to the list.
  if (phone) {
    const open = pageOpen ? sections.find((x) => x.id === section) : undefined;
    return (
      <div className="modal-backdrop sp-backdrop" onClick={() => (open ? setPageOpen(false) : onClose())}>
        <div className="sp" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr("Settings", "Nastavitve")}>
          <div className="sp-head">
            <button
              className="sp-back"
              onClick={() => (open ? setPageOpen(false) : onClose())}
              aria-label={open ? tr("Back to Settings", "Nazaj na nastavitve") : tr("Close settings", "Zapri nastavitve")}
            >
              {open ? <ChevronIcon width={22} height={22} style={{ transform: "rotate(90deg)" }} /> : <XIcon width={22} height={22} />}
            </button>
            <h3>{open ? open.label : tr("Settings", "Nastavitve")}</h3>
          </div>
          {open ? (
            <div className="sp-page settings-panel" key={open.id}>
              {content(open.id)}
            </div>
          ) : (
            <div className="sp-home">
              <button className="sp-me" onClick={() => go("account")}>
                <span className="sp-avatar">{(me.name || "O").charAt(0).toUpperCase()}</span>
                <span className="sp-me-text">
                  <b>{me.name || "Opravilko"}</b>
                  <span>{me.detail}</span>
                </span>
                <ChevronIcon width={18} height={18} className="sp-chev" />
              </button>
              {groups.map((g) => (
                <div key={g.title} className="sp-group">
                  <div className="sp-group-title">{g.title}</div>
                  <div className="sp-rows">
                    {g.ids
                      .map((id) => sections.find((x) => x.id === id))
                      .filter((x): x is (typeof sections)[number] => Boolean(x))
                      .map((x) => (
                        <button key={x.id} className="sp-row" onClick={() => go(x.id)}>
                          <span className={`sp-icon sp-icon-${x.id}`}>{x.icon}</span>
                          <span className="sp-row-text">
                            <b>{x.label}</b>
                            {summaries[x.id] && <span>{summaries[x.id]}</span>}
                          </span>
                          <ChevronIcon width={18} height={18} className="sp-chev" />
                        </button>
                      ))}
                  </div>
                </div>
              ))}
              <button className="sp-signout" onClick={() => void signOutHere()}>
                <LogOutIcon width={18} height={18} /> {firebase ? tr("Sign out", "Odjava") : tr("Disconnect Dropbox", "Prekini povezavo z Dropboxom")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr("Settings", "Nastavitve")}>
        <div className="settings-head">
          <h3>{tr("Settings", "Nastavitve")}</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label={tr("Close settings", "Zapri nastavitve")}>
            <XIcon width={18} height={18} />
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label={tr("Settings sections", "Razdelki nastavitev")}>
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
          <div className="settings-panel">{content(section)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Settings > Simple: one switch that hides the extras, each can be shown anyway. */
function SimpleSection() {
  const simple = useSimple();
  const focusCard = useFocusCard();
  const weeklyReview = useWeeklyReview();
  const calendarDone = useCalendarDone();
  const queryClient = useQueryClient();
  return (
    <>
      <label className="settings-switch">
        <input type="checkbox" checked={simple.on} onChange={(e) => setSimple(e.target.checked)} />
        <span>
          <b>{tr("Simple", "Preprosto")}</b>
          <span>{tr("Hides the extras on this device: fewer buttons, a calmer app. Each one can be brought back below.", "Na tej napravi skrije dodatke: manj gumbov, mirnejša aplikacija. Vsakega lahko spodaj vrneš nazaj.")}</span>
        </span>
      </label>
      {simple.on && (
        <div className="simple-items" role="group" aria-label={tr("Shown anyway", "Vseeno prikazano")}>
          <span className="simple-items-head">{tr("Show anyway", "Vseeno prikaži")}</span>
          {SIMPLE_ITEMS.map((it) => (
            <label key={it.key} className="simple-item">
              <input
                type="checkbox"
                checked={simple.shown.includes(it.key)}
                onChange={(e) => setSimpleShown(it.key, e.target.checked)}
              />
              <span>{it.label}</span>
            </label>
          ))}
        </div>
      )}

      <h4>{tr("More to switch on or off", "Še več za vklop ali izklop")}</h4>
      <label className="settings-switch">
        <input type="checkbox" checked={focusCard} onChange={(e) => setFocusCard(e.target.checked)} />
        <span>
          <b>{tr("Focus task", "Glavna naloga")}</b>
          <span>{tr("Now opens with today's most important task, big, with Tomorrow, Done and Start focus. Off: it's listed with the rest.", "Zdaj se odpre z najpomembnejšo nalogo dneva, veliko, z gumbi Jutri, Opravljeno in Začni fokus. Izklopljeno: je na seznamu z ostalimi.")}</span>
        </span>
      </label>
      <label className="settings-switch">
        <input type="checkbox" checked={weeklyReview} onChange={(e) => setWeeklyReview(e.target.checked)} />
        <span>
          <b>{tr("Weekly review", "Tedenski pregled")}</b>
          <span>{tr("Go through overdue and undated tasks one at a time; offered on Now at the weekend and in the menu. Off: hidden everywhere.", "Pojdi skozi zamujene naloge in naloge brez datuma, eno po eno; ponujen na strani Zdaj ob vikendu in v meniju. Izklopljeno: nikjer.")}</span>
        </span>
      </label>
      <label className="settings-switch">
        <input
          type="checkbox"
          checked={calendarDone}
          onChange={(e) => {
            setCalendarDoneOn(e.target.checked);
            queryClient.setQueryData<AppData>(["bootstrap"], (d) => (d ? { ...d } : d));
          }}
        />
        <span>
          <b>{tr("Completed tasks on the calendar", "Opravljene naloge na koledarju")}</b>
          <span>{tr("What got done, greyed with a ✓ on the day it was ticked off (the website, the app and the widget).", "Kar je bilo narejeno, sivo s ✓ na dan, ko je bilo odkljukano (spletna stran, aplikacija in pripomoček).")}</span>
        </span>
      </label>
    </>
  );
}

function Appearance() {
  const look = useLook();
  const palette = usePalette();
  const addStyle = useAddStyle();
  const swipeTasks = useSwipeTasks();
  const holidays = useHolidays();
  const queryClient = useQueryClient();
  const pinned = useSidebarPinned(look);
  const [theme, setThemeState] = useState<ThemeSetting>(() => getStoredTheme() ?? "system");

  function pickTheme(next: ThemeSetting) {
    setThemeState(next);
    if (next === "system") clearTheme();
    else setTheme(next);
  }

  return (
    <>
      <h4>{tr("Language", "Jezik")}</h4>
      <div className="segmented" role="radiogroup" aria-label={tr("Language", "Jezik")}>
        {(["en", "sl"] as const).map((l) => (
          <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? "active" : ""} onClick={() => lang !== l && setLang(l)}>
            {l === "en" ? "English" : "Slovenščina"}
          </button>
        ))}
      </div>

      <h4>{tr("Look", "Videz")}</h4>
      <div className="look-options" role="radiogroup" aria-label={tr("Look", "Videz")}>
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

      <h4>{tr("Colours", "Barve")}</h4>
      <div className="palette-options" role="radiogroup" aria-label={tr("Colours", "Barve")}>
        {PALETTES.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={palette === p.id}
            className={`palette-option ${palette === p.id ? "is-selected" : ""}`}
            onClick={() => setPalette(p.id)}
            title={p.blurb}
          >
            <span className="palette-swatch" style={{ background: p.swatch[0] }} aria-hidden="true">
              <i style={{ background: p.swatch[1] }} />
              <i style={{ background: p.swatch[2] }} />
            </span>
            <span className="palette-text">
              <b>{p.name}</b>
              <span>{p.blurb}</span>
            </span>
          </button>
        ))}
      </div>

      <h4>{tr("Add button on the phone", "Gumb za dodajanje na telefonu")}</h4>
      <div className="look-options add-style-options" role="radiogroup" aria-label={tr("Add button on the phone", "Gumb za dodajanje na telefonu")}>
        {ADD_STYLES.map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={addStyle === a.id}
            className={`look-option ${addStyle === a.id ? "is-selected" : ""}`}
            onClick={() => setAddStyle(a.id)}
          >
            <span className={`add-preview add-preview-${a.id}`} aria-hidden="true">
              <i />
            </span>
            <span className="look-option-text">
              <b>{a.name}</b>
              <span>{a.blurb}</span>
            </span>
          </button>
        ))}
      </div>

      <h4>{tr("Calendar", "Koledar")}</h4>
      <label className="settings-switch">
        <input
          type="checkbox"
          checked={holidays}
          onChange={(e) => {
            setHolidaysOn(e.target.checked);
            // The calendars (and the phone's widget) redraw with or without them.
            queryClient.setQueryData<AppData>(["bootstrap"], (d) => (d ? { ...d } : d));
          }}
        />
        <span>
          <b>{tr("Slovenian holidays", "Slovenski prazniki")}</b>
          <span>{tr("Slovenian holidays and days off on the calendars (days off in red), worked out for every year.", "Prazniki in dela prosti dnevi na koledarjih (prosti dnevi rdeče), izračunani za vsako leto.")}</span>
        </span>
      </label>

      <h4>{tr("Tasks", "Naloge")}</h4>
      <label className="settings-switch">
        <input type="checkbox" checked={swipeTasks} onChange={(e) => setSwipeTasks(e.target.checked)} />
        <span>
          <b>{tr("Swipe tasks", "Poteg nalog")}</b>
          <span>{tr("On a phone, swipe a task or a shopping item right to tick it off or left to delete it. Off: only the circle and the menu do.", "Na telefonu povleci nalogo ali nakup desno, da ga odkljukaš, ali levo, da ga izbrišeš. Izklopljeno: to delata le krogec in meni.")}</span>
        </span>
      </label>

      <h4>{tr("Theme", "Tema")}</h4>
      <div className="segmented" role="radiogroup" aria-label={tr("Theme", "Tema")}>
        {(["system", "light", "dark"] as const).map((t) => (
          <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "active" : ""} onClick={() => pickTheme(t)}>
            {t === "system" ? tr("Match device", "Kot naprava") : t === "light" ? tr("Light", "Svetla") : tr("Dark", "Temna")}
          </button>
        ))}
      </div>

      {/* Pinning the sidebar is for wide screens; the phone always slides it in. */}
      {!appUi && <h4>{tr("Sidebar", "Stranski meni")}</h4>}
      {!appUi && <label className="settings-switch">
        <input type="checkbox" checked={pinned} onChange={(e) => setSidebarPinned(look, e.target.checked)} />
        <span>
          <b>{tr("Keep the sidebar open", "Stranski meni naj ostane odprt")}</b>
          <span>{tr("Or let it slide away and open it from the ☰ button. Same as the pin at the top of the sidebar.", "Ali naj se skrije in ga odpreš z gumbom ☰. Enako kot žebljiček na vrhu menija.")}</span>
        </span>
      </label>}

      <p className="settings-note">{tr("Appearance and language are saved on this device only, so your phone and computer can differ.", "Videz in jezik sta shranjena le na tej napravi, zato se telefon in računalnik lahko razlikujeta.")}</p>
    </>
  );
}

function Sharing() {
  const { data } = useBootstrap();
  if (!data) return null;
  return (
    <>
      <h4>{tr("Partner (Midva)", "Partner (Midva)")}</h4>
      <p className="settings-note top">
        {isSl ? (
          <>
            Naloge, ki jim vklopiš <b>Deli</b> (ali napišeš <code>+midva</code>), gredo partnerju in se obema prikažejo v
            Midva. Cele projekte deliš iz menija ⋯ projekta.
          </>
        ) : (
          <>
            Tasks you switch to <b>Share</b> (or type <code>+midva</code>) go to your partner, and show up for both of you in
            Midva. Whole projects are shared from the project's ⋯ menu.
          </>
        )}
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
            {tr("Disconnect", "Prekini povezavo")}
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
      <h4>{tr("Notifications", "Obvestila")}</h4>
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
          <b>{tr(`Tell me what ${name} adds or finishes`, `Povej mi, kaj ${name} doda ali opravi`)}</b>
          <span>
            {tr(
              `For example "${name} added to Shopping: milk, eggs". Checked about every 15 minutes, also with the app closed; not while you're in the app.`,
              `Na primer »${name} je dodal(a) v Nakupe: mleko, jajca«. Preverjeno približno vsakih 15 minut, tudi z zaprto aplikacijo; ne, ko si v njej.`
            )}
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
      <h4>{tr("Reminders", "Opomniki")}</h4>
      <p className="settings-note top">
        {tr(
          "Add reminders to a task from its Reminders row, or while adding it. Your phone notifies you even when the app is closed, including for reminders you set here on the website.",
          "Opomnike nalogi dodaš v vrstici Opomniki ali med dodajanjem. Telefon te opomni tudi z zaprto aplikacijo, tudi za opomnike, nastavljene tukaj na spletni strani."
        )}
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
                  ? tr("Notifications are blocked. Allow them for Opravilko in Android's settings, then try again.", "Obvestila so blokirana. Dovoli jih za Opravilko v nastavitvah Androida in poskusi znova.")
                  : tr("Your browser blocked notifications. Allow them in the site settings, then try again.", "Brskalnik je blokiral obvestila. Dovoli jih v nastavitvah strani in poskusi znova."),
              });
          }}
        />
        <span>
          <b>{isNativeApp ? tr("Notify me on this phone", "Obveščaj me na tem telefonu") : tr("Also notify me in this browser", "Obveščaj me tudi v tem brskalniku")}</b>
          <span>
            {isNativeApp
              ? tr("For the reminders you add, at their time.", "Za opomnike, ki jih dodaš, ob njihovem času.")
              : tr("Only while a tab is open. Not needed for your phone to remind you.", "Le dokler je zavihek odprt. Za opomnike na telefonu ni potrebno.")}
          </span>
        </span>
      </label>

      <h4>{tr("Default reminder for new tasks", "Privzeti opomnik za nove naloge")}</h4>
      <div className="settings-pick">
        <span>{tr("Tasks with a time", "Naloge z uro")}</span>
        <Select
          className="select"
          sheetTitle={tr("Tasks with a time", "Naloge z uro")}
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
        <span>{tr("All-day tasks", "Celodnevne naloge")}</span>
        <Select
          className="select"
          sheetTitle={tr("All-day tasks", "Celodnevne naloge")}
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
      <p className="settings-note">{tr("Added to new tasks with a date unless you pick reminders yourself. Saved on this device only.", "Doda se novim nalogam z datumom, razen če opomnike izbereš sam. Shranjeno le na tej napravi.")}</p>
    </>
  );
}

function DataSection({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const firebase = usingFirebase();
  return (
    <>
      <h4>{tr("Backup", "Varnostna kopija")}</h4>
      <p className="settings-note top">
        {firebase
          ? tr("Everything in one file: projects, tasks, labels, filters, calendars and history, including older completed tasks. You can import it again on a first sign-in.", "Vse v eni datoteki: projekti, naloge, oznake, filtri, koledarji in zgodovina, tudi starejše opravljene naloge. Ob prvi prijavi jo lahko znova uvoziš.")
          : tr("Everything in one file: projects, tasks, labels, filters, calendars and history. You can import it again on a first sign-in.", "Vse v eni datoteki: projekti, naloge, oznake, filtri, koledarji in zgodovina. Ob prvi prijavi jo lahko znova uvoziš.")}
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
        {busy ? tr("Preparing…", "Pripravljam …") : tr("Download backup", "Prenesi varnostno kopijo")}
      </button>

      {firebase && <GmailKey />}

      <h4>{tr("Import from Todoist", "Uvoz iz Todoista")}</h4>
      <ImportModal embedded onClose={onClose} />
    </>
  );
}

/** The key for the Gmail add-on (gmail-addon/ in the repo): made here, pasted there once. */
function GmailKey() {
  const [has, setHas] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void hasGmailKey().then(setHas);
  }, []);
  return (
    <>
      <h4>Gmail</h4>
      <p className="settings-note top">
        {tr("The Opravilko add-on in Gmail turns an email into a task. It needs a key from here, pasted into it once.", "Dodatek Opravilko v Gmailu iz e-pošte naredi nalogo. Potrebuje ključ od tukaj, ki ga enkrat prilepiš vanj.")}
        {has && !key ? tr(" You have one; making a new one stops the old one working.", " Enega že imaš; nov ključ ustavi starega.") : ""}
      </p>
      {key ? (
        <div className="gmail-key">
          <code>{key}</code>
          <button
            className="btn btn-secondary"
            onClick={() => void navigator.clipboard.writeText(key).then(() => setCopied(true), () => setCopied(false))}
          >
            {copied ? tr("Copied", "Kopirano") : tr("Copy", "Kopiraj")}
          </button>
          <span className="settings-note">{tr("Shown only now: paste it into the add-on (Settings in its panel).", "Prikazan le zdaj: prilepi ga v dodatek (Settings v njegovem oknu).")}</span>
        </div>
      ) : (
        <button
          className="btn btn-secondary"
          disabled={busy || has === null}
          onClick={async () => {
            setBusy(true);
            try {
              setKey(await makeGmailKey());
              setHas(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? tr("Making…", "Ustvarjam …") : has ? tr("Make a new key", "Ustvari nov ključ") : tr("Make a key", "Ustvari ključ")}
        </button>
      )}
    </>
  );
}

function Account({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const firebase = usingFirebase();
  const user = currentUser();
  return (
    <>
      <h4>{tr("Account", "Račun")}</h4>
      <div className="settings-account">
        {firebase ? (
          <>
            <b>{user?.displayName || user?.email}</b>
            <span>
              {tr("Signed in with Google", "Prijavljen z Googlom")}
              {user?.email ? tr(` as ${user.email}`, ` kot ${user.email}`) : ""}
              {tr(". Your tasks are stored in Firebase.", ". Naloge so shranjene v Firebase.")}
            </span>
          </>
        ) : (
          <>
            <b>Dropbox</b>
            <span>{tr(`Your tasks are stored in your Dropbox, in ${DATA_PATH}.`, `Naloge so shranjene v tvojem Dropboxu, v ${DATA_PATH}.`)}</span>
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
        <LogOutIcon width={15} height={15} /> {firebase ? tr("Sign out", "Odjava") : tr("Disconnect Dropbox", "Prekini povezavo z Dropboxom")}
      </button>
    </>
  );
}
