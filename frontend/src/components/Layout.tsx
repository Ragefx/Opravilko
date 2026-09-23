import { useCallback, useEffect, useRef, useState } from "react";
import { syncArrivalPlaces } from "../native/places";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { isNativeApp } from "../dropbox/auth";
import { useBootstrap, useSyncAllCalendarFeeds } from "../api/hooks";
import { REMINDERS_CHANGED, checkDueReminders, syncNativeReminders } from "../utils/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { hasPendingWrite, isSignedIn, needsSetup } from "../data/store";
import { onAppResume } from "../native/android";
import {
  WIDGET_QUICK_ADD,
  onWidgetDataChanged,
  pushWidgetData,
  takeQuickAddRequest,
  type QuickAddRequest,
} from "../native/widget";
import Sidebar from "./Sidebar";
import SearchModal from "./SearchModal";
import ShareSheet from "./ShareSheet";
import { useSharedShoppingList } from "./useSharedShoppingList";
import QuickAddModal from "./QuickAddModal";
import ShortcutsModal from "./ShortcutsModal";
import CommandPalette from "./CommandPalette";
import SettingsModal from "./SettingsModal";
import SocaTopBar from "./SocaTopBar";
import { useLook } from "../utils/look";
import { setSidebarPinned, useSidebarPinned } from "../utils/sidebarPin";
import SyncIndicator from "./SyncIndicator";
import { ToastProvider } from "./ToastProvider";
import { MenuIcon, PlusIcon, SearchIcon } from "./icons";

/** True when focus is in a text field, where single-letter shortcuts must not fire. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export default function Layout() {
  // The shopping list is shared with your partner by default.
  useSharedShoppingList();
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Set when the Android widget's + opened quick add (its project / due today).
  const [quickAddPreset, setQuickAddPreset] = useState<QuickAddRequest | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const look = useLook();
  const pinned = useSidebarPinned(look);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Picking a destination in the mobile drawer should close it.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);
  const appData = useBootstrap().data;
  const tasks = appData?.tasks;
  const syncAllCalendarFeeds = useSyncAllCalendarFeeds();
  // Tracks the "g" prefix of two-key navigation chords (g t, g u, g i).
  const goChord = useRef(false);

  const [remindersVersion, setRemindersVersion] = useState(0);
  useEffect(() => {
    const bump = () => setRemindersVersion((v) => v + 1);
    window.addEventListener(REMINDERS_CHANGED, bump);
    return () => window.removeEventListener(REMINDERS_CHANGED, bump);
  }, []);

  useEffect(() => {
    if (!tasks) return;
    // The Android app hands reminders to the OS ahead of time (they fire even
    // when it's closed); rebuild that schedule shortly after tasks change.
    if (isNativeApp) {
      const t = window.setTimeout(() => void syncNativeReminders(tasks).catch(() => {}), 1500);
      return () => window.clearTimeout(t);
    }
    // On the website, reminders only fire while the tab is open.
    checkDueReminders(tasks);
    const id = window.setInterval(() => checkDueReminders(tasks), 60_000);
    return () => window.clearInterval(id);
  }, [tasks, remindersVersion]);

  // Coming back to the app after a while: pick up edits made on other devices,
  // unless we have unsaved edits of our own (those win the usual conflict check).
  const queryClient = useQueryClient();
  useEffect(
    () =>
      onAppResume(() => {
        if (!hasPendingWrite()) void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      }),
    [queryClient]
  );

  // Android home-screen widget: keep its copy of the tasks current, reload when
  // it completed something itself, and open quick add from its + button.
  useEffect(() => {
    if (!isNativeApp || !appData) return;
    const t = window.setTimeout(() => pushWidgetData(appData), 800);
    return () => window.clearTimeout(t);
  }, [appData]);
  useEffect(
    () =>
      onWidgetDataChanged(() => {
        if (!hasPendingWrite()) void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      }),
    [queryClient]
  );
  useEffect(() => {
    const open = () => {
      const request = takeQuickAddRequest();
      if (!request) return;
      setQuickAddPreset(request);
      setQuickAddOpen(true);
    };
    open(); // asked for before this mounted (cold start)
    window.addEventListener(WIDGET_QUICK_ADD, open);
    return () => window.removeEventListener(WIDGET_QUICK_ADD, open);
  }, []);

  // Android app: arrival reminders follow the tasks (added, ticked off, moved).
  useEffect(() => {
    if (tasks) syncArrivalPlaces(tasks);
  }, [tasks]);

  // Subscribed calendar feeds have no push either -- refresh once on load, then
  // hourly for as long as the tab stays open. With no connection (offline, or
  // the hourly timer firing as a laptop wakes before its Wi-Fi is back), try
  // again in a minute and as soon as the browser is back online.
  useEffect(() => {
    let retry: number | undefined;
    const run = async () => {
      window.clearTimeout(retry);
      const ok = await syncAllCalendarFeeds();
      if (!ok) retry = window.setTimeout(() => void run(), 60_000);
    };
    void run();
    const id = window.setInterval(() => void run(), 60 * 60_000);
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(retry);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;

      if (goChord.current) {
        goChord.current = false;
        const dest = { h: "/app/home", t: "/app/today", u: "/app/upcoming", i: "/app/inbox", c: "/app/completed" }[
          e.key.toLowerCase()
        ];
        if (dest) {
          e.preventDefault();
          navigate(dest);
          return;
        }
      }

      switch (e.key) {
        case "q":
          e.preventDefault();
          setQuickAddOpen(true);
          break;
        case "/":
          e.preventDefault();
          setSearchOpen(true);
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
          break;
        case "g":
          goChord.current = true;
          window.setTimeout(() => (goChord.current = false), 1200);
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  if (!isSignedIn()) return <Navigate to="/connect" replace />;
  // First Google sign-in: import or start fresh before anything else.
  if (appData && needsSetup()) return <Navigate to="/setup" replace />;

  return (
    <ToastProvider>
      <div className={`app-shell ${look === "soca" ? "soca-shell" : ""} ${pinned ? "sidebar-pinned" : "sidebar-unpinned"}`}>
        {/* In the Soča look the sidebar is a drawer at every width, opened from the top bar. */}
        <Sidebar
          onSearch={() => setSearchOpen(true)}
          onQuickAdd={() => setQuickAddOpen(true)}
          onOpenSettings={openSettings}
          pinned={pinned}
          onTogglePin={() => {
            setSidebarPinned(look, !pinned);
            setNavOpen(false);
          }}
          mobileOpen={navOpen}
        />
        {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}
        <main className="main">
          {look === "soca" && (
            <SocaTopBar
              onMenu={() => setNavOpen(true)}
              onCommand={() => setSearchOpen(true)}
              onQuickAdd={() => setQuickAddOpen(true)}
            />
          )}
          <div className="mobile-appbar">
            <button className="mobile-appbar-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
              <MenuIcon width={22} height={22} />
            </button>
            <span className="mobile-appbar-title">Opravilko</span>
            <button className="mobile-appbar-btn" onClick={() => setSearchOpen(true)} aria-label="Search">
              <SearchIcon width={20} height={20} />
            </button>
            <button className="mobile-appbar-btn" onClick={() => setQuickAddOpen(true)} aria-label="Add task">
              <PlusIcon width={22} height={22} />
            </button>
          </div>
          {look !== "soca" && <SyncIndicator />}
          <Outlet />
        </main>
        {searchOpen &&
          (look === "soca" ? (
            <CommandPalette onClose={closeSearch} onOpenSettings={openSettings} />
          ) : (
            <SearchModal onClose={closeSearch} />
          ))}
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        {quickAddOpen && (
          <QuickAddModal
            onClose={() => {
              setQuickAddOpen(false);
              setQuickAddPreset(null);
            }}
            defaultProjectId={
              quickAddPreset?.projectId ?? location.pathname.match(/^\/app\/project\/([^/]+)/)?.[1] ?? "inbox"
            }
            defaultToday={quickAddPreset?.today}
            defaultDate={quickAddPreset?.date}
            listenOnOpen={quickAddPreset?.voice}
          />
        )}
        <ShareSheet />
        {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      </div>
    </ToastProvider>
  );
}
