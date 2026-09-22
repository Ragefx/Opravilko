import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { isConnected } from "../dropbox/auth";
import { useBootstrap, useSyncAllCalendarFeeds } from "../api/hooks";
import { checkDueReminders } from "../utils/notifications";
import Sidebar from "./Sidebar";
import SearchModal from "./SearchModal";
import QuickAddModal from "./QuickAddModal";
import ShortcutsModal from "./ShortcutsModal";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Picking a destination in the mobile drawer should close it.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);
  const tasks = useBootstrap().data?.tasks;
  const syncAllCalendarFeeds = useSyncAllCalendarFeeds();
  // Tracks the "g" prefix of two-key navigation chords (g t, g u, g i).
  const goChord = useRef(false);

  // Reminders only fire while the app is open -- there's no server to push them.
  useEffect(() => {
    if (!tasks) return;
    checkDueReminders(tasks);
    const id = window.setInterval(() => checkDueReminders(tasks), 60_000);
    return () => window.clearInterval(id);
  }, [tasks]);

  // Subscribed calendar feeds have no push either -- refresh once on load, then
  // hourly for as long as the tab stays open.
  useEffect(() => {
    void syncAllCalendarFeeds();
    const id = window.setInterval(() => void syncAllCalendarFeeds(), 60 * 60_000);
    return () => window.clearInterval(id);
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
        const dest = { t: "/app/today", u: "/app/upcoming", i: "/app/inbox", c: "/app/completed" }[
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

  if (!isConnected()) return <Navigate to="/connect" replace />;

  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar
          onSearch={() => setSearchOpen(true)}
          onQuickAdd={() => setQuickAddOpen(true)}
          mobileOpen={navOpen}
        />
        {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}
        <main className="main">
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
          <SyncIndicator />
          <Outlet />
        </main>
        {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
        {quickAddOpen && (
          <QuickAddModal
            onClose={() => setQuickAddOpen(false)}
            defaultProjectId={location.pathname.match(/^\/app\/project\/([^/]+)/)?.[1] ?? "inbox"}
          />
        )}
        {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      </div>
    </ToastProvider>
  );
}
