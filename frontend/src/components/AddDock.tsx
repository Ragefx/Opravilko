import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useBootstrap } from "../api/hooks";
import type { AddStyle } from "../utils/addStyle";
import { CalendarIcon, CartIcon, CheckIcon, FocusIcon, InboxIcon, MicIcon, PlusIcon, ShareIcon } from "./icons";

type Action = "task" | "shop" | "voice";

/**
 * Taps, holds and swipes on an add button: a tap adds, a hold opens the small
 * menu, and (on the dot) a swipe left adds to shopping, a swipe up listens.
 */
function useGestures(on: { tap: () => void; hold: () => void; left?: () => void; up?: () => void }) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const held = useRef(false);
  // A plain tap waits for the click: opening the card on finger-up let the
  // phone's click that follows land on whatever the card put under the finger.
  const tapped = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    onPointerDown: (e: PointerEvent) => {
      // Keep getting the moves when a swipe leaves the button.
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      held.current = false;
      tapped.current = false;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        held.current = true;
        navigator.vibrate?.(15);
        on.hold();
      }, 450);
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) window.clearTimeout(timer.current);
    },
    onPointerUp: (e: PointerEvent) => {
      window.clearTimeout(timer.current);
      const s = start.current;
      start.current = null;
      if (!s || held.current) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (on.left && dx < -40 && Math.abs(dx) > Math.abs(dy)) on.left();
      else if (on.up && dy < -40 && Math.abs(dy) > Math.abs(dx)) on.up();
      else if (Math.hypot(dx, dy) < 12) tapped.current = true;
    },
    onClick: () => {
      if (!tapped.current) return;
      tapped.current = false;
      on.tap();
    },
    onPointerCancel: () => {
      window.clearTimeout(timer.current);
      start.current = null;
    },
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };
}

function AddMenu({ onPick, onClose, className }: { onPick: (a: Action) => void; onClose: () => void; className: string }) {
  return (
    <>
      <div className="add-menu-scrim" onClick={onClose} />
      <div className={`add-menu ${className}`} role="menu">
        <button role="menuitem" onClick={() => onPick("voice")}>
          <MicIcon width={17} height={17} /> Voice
        </button>
        <button role="menuitem" onClick={() => onPick("shop")}>
          <CartIcon width={17} height={17} /> Shopping item
        </button>
        <button role="menuitem" onClick={() => onPick("task")}>
          <CheckIcon width={16} height={16} /> Task
        </button>
      </div>
    </>
  );
}

/** The phone's add button at the bottom of the screen, in the style picked in Settings. */
export default function AddDock({
  style,
  onTask,
  onVoice,
}: {
  style: Exclude<AddStyle, "top">;
  onTask: () => void;
  onVoice: () => void;
}) {
  const { data } = useBootstrap();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const onShopping = pathname.startsWith("/app/shopping");
  const onHome = /^\/app\/?(home)?$/.test(pathname);
  // Out of the way while typing (the keyboard would push it up over the page).
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = document.activeElement as HTMLElement | null;
      setTyping(!!el && (el.tagName === "TEXTAREA" || el.isContentEditable || (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|color|file)$/.test((el as HTMLInputElement).type))));
    };
    const later = () => window.setTimeout(check, 0);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", later);
    };
  }, []);

  // On the shopping list, adding means adding to the list.
  function run(action: Action) {
    setMenu(false);
    if (action === "shop" || (action === "task" && onShopping)) navigate("/app/shopping?add=1");
    else if (action === "voice" && onShopping) navigate("/app/shopping?voice=1");
    else if (action === "voice") onVoice();
    else onTask();
  }
  const gestures = useGestures({
    tap: () => run("task"),
    hold: () => setMenu(true),
    left: style === "dot" ? () => run("shop") : undefined,
    up: style === "dot" ? () => run("voice") : undefined,
  });
  if (typing) return null;
  const menuEl = menu && <AddMenu className={`add-menu-${style} ${onHome ? "is-raised" : ""}`} onPick={run} onClose={() => setMenu(false)} />;

  if (style === "tabs") {
    const tab = (to: string, label: string, icon: ReactNode) => (
      <NavLink to={to} className={({ isActive }) => `add-tab ${isActive || (to === "/app/home" && onHome) ? "is-active" : ""}`}>
        {icon}
        <span>{label}</span>
      </NavLink>
    );
    return (
      <nav className="add-tabs" aria-label="Main">
        {tab("/app/home", "Now", <FocusIcon width={21} height={21} />)}
        {tab("/app/calendar", "Calendar", <CalendarIcon width={21} height={21} />)}
        <button className="add-tabs-plus" aria-label={onShopping ? "Add to shopping" : "Add task"} {...gestures}>
          <PlusIcon width={26} height={26} strokeWidth={2.6} />
        </button>
        {tab("/app/shopping", "Shopping", <CartIcon width={21} height={21} />)}
        {data?.me
          ? tab("/app/midva", "Midva", <ShareIcon width={21} height={21} />)
          : tab("/app/inbox", "Inbox", <InboxIcon width={21} height={21} />)}
        {menuEl}
      </nav>
    );
  }

  if (style === "bar") {
    return (
      <div className="add-bar-wrap">
        <div className="add-bar">
          <button className="add-bar-text" onClick={() => run("task")} onContextMenu={(e) => e.preventDefault()}>
            {onShopping ? "Add to shopping…" : "Add a task…"}
          </button>
          <button className="add-bar-mic" onClick={() => run("voice")} aria-label="Add by voice">
            <MicIcon width={20} height={20} />
          </button>
          <button className="add-bar-go" aria-label={onShopping ? "Add to shopping" : "Add task"} {...gestures}>
            <PlusIcon width={22} height={22} strokeWidth={2.6} />
          </button>
        </div>
        {menuEl}
      </div>
    );
  }

  // The corner button and the dot float over the page (above Now's Now / Next / Later).
  return (
    <>
      <button
        className={`add-float add-${style} ${onHome ? "is-raised" : ""}`}
        aria-label={onShopping ? "Add to shopping" : "Add task"}
        {...gestures}
      >
        {style === "dot" ? (
          <>
            {onShopping ? <CartIcon width={26} height={26} strokeWidth={2.4} /> : <CheckIcon width={26} height={26} />}
            <b aria-hidden="true">+</b>
          </>
        ) : (
          <PlusIcon width={26} height={26} strokeWidth={2.6} />
        )}
      </button>
      {menuEl}
    </>
  );
}
