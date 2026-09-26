import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { useAddAttachments, useBootstrap, useCreateTask } from "../api/hooks";
import type { Due, Reminder, Task, TaskLocation } from "../api/types";
import { highlightParts, parseQuickAddInput } from "../utils/quickAddParse";
import { formatDueLabel, todayISO } from "../utils/date";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { type RepeatPreset, REPEAT_PRESETS, applyRecurrence } from "../utils/recurrence";
import { addPlaces } from "../utils/addTargets";
import { hasPendingWrite, usingFirebase } from "../data/store";
import { uploadAttachment } from "../firebase/attachments";
import { useKeyboardInset } from "../native/keyboard";
import DatePickerPopup from "./DatePickerPopup";
import LocationPicker from "./LocationPicker";
import MicButton from "./MicButton";
import { useToast } from "./ToastProvider";
import { BellIcon, CalendarIcon, FlagIcon, InboxIcon, MapPinIcon, PlusIcon, RepeatIcon, ShareIcon, TagIcon } from "./icons";
import ReminderSheet from "./ReminderSheet";
import { shortReminder } from "../utils/reminders";
import Select from "./Select";
import { appUi } from "../utils/appUi";
import { useAddStyle } from "../utils/addStyle";
import { Keyboard } from "@capacitor/keyboard";
import { isNativeApp } from "../dropbox/auth";

/** A paper clip, as on the widget's card. */
const AttachIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.5 11.5l-8.4 8.4a5 5 0 0 1-7.1-7.1l8.4-8.4a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
  </svg>
);
const NotesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
);
/** A project's section, as in the widget's list. */
const SectionIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h12M6 20h12M6 8h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
  </svg>
);
const SendIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

/** The app card's icons, and the order they were dragged into (kept on this device). */
const TOOL_ORDER_KEY = "opravilko.addTools";
const TOOLS = ["date", "priority", "reminders", "labels", "location", "repeat", "attach", "share"];
function storedTools(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(TOOL_ORDER_KEY) ?? "null");
    if (Array.isArray(saved)) {
      const known = saved.filter((k): k is string => TOOLS.includes(k));
      return [...known, ...TOOLS.filter((k) => !known.includes(k))];
    }
  } catch {
    /* ignore */
  }
  return TOOLS;
}

/** Waits (up to ~10 s) until the new task has reached the database, so a file can go on it. */
async function taskSaved(): Promise<void> {
  for (let i = 0; i < 40 && hasPendingWrite(); i++) await new Promise((r) => setTimeout(r, 250));
}

/**
 * Add task in the Android app: the same card as the home-screen widget's,
 * sitting on top of the keyboard. The name (dates, times, p1, @labels,
 * #project are read from it as usual), a description when asked for, and a
 * row of chips that scrolls sideways: + (description, labels, location,
 * repeat, share), where it goes, the date, an attachment and the priority.
 * It stays open for the next task.
 *
 * On the website the same card is a window near the top of the screen
 * (Todoist-like): name, description, a row of small buttons, and a footer
 * with where it goes, Cancel and Add task; it closes once the task is added.
 */
export default function QuickAddSheet({
  onClose,
  defaultProjectId = "inbox",
  defaultToday = false,
  defaultDate,
  listenOnOpen = false,
}: {
  onClose: () => void;
  defaultProjectId?: string;
  defaultToday?: boolean;
  defaultDate?: string;
  listenOnOpen?: boolean;
}) {
  const { data } = useBootstrap();
  const createTask = useCreateTask();
  const addAttachments = useAddAttachments();
  const showToast = useToast();
  const keyboard = useKeyboardInset();
  // Opening: it grows out of the bottom bar's +, and rises for every other style.
  const addStyle = useAddStyle();
  const partner = data?.partner;
  const projects = data?.projects ?? [];

  const places = addPlaces(data);
  const [targetKey, setTargetKey] = useState(
    () => (places.find((t) => t.projectId === defaultProjectId && !t.sectionId) ?? places[0]).key
  );
  const [text, setText] = useState("");
  // The website's window (the app has the card on the keyboard).
  const dialog = !appUi;
  const [description, setDescription] = useState<string | null>("");
  const [picked, setPicked] = useState<Due | null | undefined>(undefined);
  const [priority, setPriority] = useState<number | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [location, setLocation] = useState<TaskLocation | null>(null);
  const [repeat, setRepeat] = useState<RepeatPreset | "none">("none");
  const [shared, setShared] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [where, setWhere] = useState(false);
  const [picking, setPicking] = useState<null | "date" | "labels" | "location" | "reminders">(null);
  // In the app, Back first only closes the keyboard (Android leaves the name
  // field focused). Close the card along with it, so one Back does both --
  // unless the keyboard went because of a tap in the card (a chip, the mic,
  // a picker) or something is open over it.
  const lastTouch = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pickingRef = useRef<string | null>(null);
  pickingRef.current = picking;
  useEffect(() => {
    if (!isNativeApp) return;
    const listener = Keyboard.addListener("keyboardDidHide", () => {
      if (Date.now() - lastTouch.current < 800 || pickingRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && el.closest(".qas-card") && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) closeRef.current();
    });
    return () => {
      void listener.then((l) => l.remove());
    };
  }, []);
  // Picked here; left untouched, this device's defaults from Settings apply (none unless set).
  const [reminders, setReminders] = useState<Reminder[] | undefined>(undefined);
  const dateChip = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const [toolOrder, setToolOrder] = useState(storedTools);
  useEffect(() => {
    try {
      localStorage.setItem(TOOL_ORDER_KEY, JSON.stringify(toolOrder));
    } catch {
      /* ignore */
    }
  }, [toolOrder]);
  const [dragging, setDragging] = useState<string | null>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; pointer: number; active: boolean; timer: number } | null>(null);
  const justDragged = useRef(false);
  // While an icon is being dragged the row mustn't scroll away under it.
  useEffect(() => {
    const row = toolsRef.current;
    if (!row) return;
    const stop = (e: TouchEvent) => {
      if (drag.current?.active) e.preventDefault();
    };
    row.addEventListener("touchmove", stop, { passive: false });
    return () => row.removeEventListener("touchmove", stop);
  }, []);
  const mirror = useRef<HTMLDivElement>(null);

  const [defaultDue] = useState(() =>
    defaultDate
      ? { date: defaultDate, string: format(parseISO(defaultDate), "MMM d") }
      : defaultToday
        ? { date: todayISO(), string: "today" }
        : null
  );
  const preview = text.trim() ? parseQuickAddInput(text, defaultDue) : null;
  const baseDue: Due | null =
    picked !== undefined ? picked : preview?.due ?? (defaultDue ? { ...defaultDue, isRecurring: false } : null);

  // A typed "#Project" narrows where it goes to that project's sections.
  const typedProject = preview?.projectName
    ? projects.find((p) => p.name.toLowerCase() === preview.projectName!.toLowerCase())
    : undefined;
  const chosen = places.find((t) => t.key === targetKey) ?? places[0];
  const target =
    typedProject && chosen.projectId !== typedProject.id
      ? places.find((t) => t.projectId === typedProject.id && !t.sectionId) ?? chosen
      : chosen;
  const effectivePriority = (priority ?? (preview && preview.priority !== 1 ? preview.priority : 1)) as Task["priority"];
  const allLabels = [...new Set([...(preview?.labels ?? []), ...labels])];
  const isInbox = target.projectId === "inbox" || projects.find((p) => p.id === target.projectId)?.isInboxProject;


  async function submit() {
    if (!preview?.content) return;
    const isShared = Boolean(partner && (shared || preview.shared));
    const task = await createTask.mutateAsync({
      content: preview.content,
      description: description?.trim() ?? "",
      projectId: target.projectId,
      sectionId: target.sectionId,
      priority: effectivePriority,
      due: applyRecurrence(baseDue, repeat),
      labels: allLabels,
      ...(location ? { location } : {}),
      reminders,
      sharedWith: isShared && partner ? [partner.uid] : undefined,
    });
    if (dialog) {
      showToast({
        message: `Added to ${target.label}${isShared && partner ? `, shared with ${partner.name.split(" ")[0]}` : ""}`,
      });
      onClose();
    } else {
      setAdded(`✓ ${preview.content} → ${target.label}`);
    }
    // Ready for the next one: the name and the extras go, where and when stay.
    setText("");
    setDescription("");
    setPriority(null);
    setLabels([]);
    setLocation(null);
    setReminders(undefined);
    setRepeat("none");
    title.current?.focus();
    if (file) {
      const f = file;
      setFile(null);
      try {
        await taskSaved();
        const att = await uploadAttachment(task.id, f);
        addAttachments.mutate({ id: task.id, attachments: [att] });
      } catch (err) {
        showToast({ message: (err as Error).message || "The file couldn't be attached." });
      }
    }
  }

  // The app's tokens: each thing that's set, to change or clear.
  const tokens: { key: string; label: string; color?: string; open: () => void; clear: () => void }[] = [];
  if (baseDue)
    tokens.push({
      key: "date",
      label: formatDueLabel(baseDue),
      color: baseDue.date < todayISO() ? "var(--color-danger)" : "var(--color-accent)",
      open: () => setPicking("date"),
      clear: () => setPicked(null),
    });
  if (effectivePriority !== 1)
    tokens.push({
      key: "priority",
      label: `P${5 - effectivePriority}`,
      color: PRIORITY_META[effectivePriority].color,
      open: () => {},
      clear: () => setPriority(1),
    });
  if (repeat !== "none")
    tokens.push({
      key: "repeat",
      label: REPEAT_PRESETS.find((p) => p.key === repeat)?.label ?? "Repeats",
      open: () => {},
      clear: () => setRepeat("none"),
    });
  if (reminders?.length)
    tokens.push({
      key: "reminders",
      label: `🔔 ${shortReminder(reminders[0])}${reminders.length > 1 ? ` +${reminders.length - 1}` : ""}`,
      open: () => setPicking("reminders"),
      clear: () => setReminders([]),
    });
  if (allLabels.length)
    tokens.push({ key: "labels", label: `@${allLabels.join(" @")}`, open: () => setPicking("labels"), clear: () => setLabels([]) });
  if (location)
    tokens.push({ key: "location", label: `📍 ${location.name}`, open: () => setPicking("location"), clear: () => setLocation(null) });
  if (file) tokens.push({ key: "file", label: `📎 ${file.name}`, open: () => fileInput.current?.click(), clear: () => setFile(null) });
  if (shared && partner)
    tokens.push({ key: "shared", label: `With ${partner.name.split(" ")[0]}`, open: () => setShared(false), clear: () => setShared(false) });

  const dueColor = !baseDue ? undefined : baseDue.date < todayISO() ? "var(--color-danger)" : "var(--color-accent)";
  const menuItems: { label: string; icon: ReactNode; run: () => void }[] = [
    { label: "Description", icon: <NotesIcon />, run: () => setDescription((d) => d ?? "") },
    { label: "Labels", icon: <TagIcon width={20} height={20} />, run: () => setPicking("labels") },
    { label: "Location", icon: <MapPinIcon width={20} height={20} />, run: () => setPicking("location") },
    { label: "Reminders", icon: <BellIcon width={20} height={20} />, run: () => setPicking("reminders") },
  ];

  // The app card's icons, in the order you've dragged them into.
  const toolEls: Record<string, ReactNode> = {
    date: (
      <button ref={dateChip} type="button" className={`qab-tool ${baseDue ? "is-on" : ""}`} onClick={() => setPicking("date")} aria-label="Date">
        <CalendarIcon width={19} height={19} />
      </button>
    ),
    priority: (
      <label
        className={`qab-tool ${effectivePriority !== 1 ? "is-on" : ""}`}
        style={effectivePriority !== 1 ? { color: PRIORITY_META[effectivePriority].color } : undefined}
        aria-label="Priority"
      >
        <FlagIcon width={19} height={19} />
        <Select value={effectivePriority} onChange={(e) => setPriority(Number(e.target.value))} aria-label="Priority">
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].label}
            </option>
          ))}
        </Select>
      </label>
    ),
    reminders: (
      <button type="button" className={`qab-tool ${reminders?.length ? "is-on" : ""}`} onClick={() => setPicking("reminders")} aria-label="Reminders">
        <BellIcon width={19} height={19} />
      </button>
    ),
    labels: (
      <button type="button" className={`qab-tool ${allLabels.length ? "is-on" : ""}`} onClick={() => setPicking("labels")} aria-label="Labels">
        <TagIcon width={19} height={19} />
      </button>
    ),
    location: (
      <button type="button" className={`qab-tool ${location ? "is-on" : ""}`} onClick={() => setPicking("location")} aria-label="Location">
        <MapPinIcon width={19} height={19} />
      </button>
    ),
    repeat: (
      <label className={`qab-tool ${repeat !== "none" ? "is-on" : ""}`} aria-label="Repeat">
        <RepeatIcon width={19} height={19} />
        <Select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatPreset | "none")} aria-label="Repeat">
          <option value="none">Doesn't repeat</option>
          {REPEAT_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
      </label>
    ),
    attach: usingFirebase() ? (
      <button type="button" className={`qab-tool ${file ? "is-on" : ""}`} onClick={() => fileInput.current?.click()} aria-label="Attach a photo or file">
        <AttachIcon />
      </button>
    ) : null,
    share: partner ? (
      <button
        type="button"
        className={`qab-tool ${shared ? "is-on" : ""}`}
        onClick={() => setShared((v) => !v)}
        aria-pressed={shared}
        aria-label={`Share with ${partner.name.split(" ")[0]}`}
      >
        <ShareIcon width={19} height={19} />
      </button>
    ) : null,
  };

  // Hold an icon, then slide it left or right: the row reorders under your finger.
  function onToolDown(e: ReactPointerEvent) {
    justDragged.current = false;
    const slot = (e.target as HTMLElement).closest<HTMLElement>("[data-tool]");
    if (!slot) return;
    const d = { id: slot.dataset.tool!, x: e.clientX, y: e.clientY, pointer: e.pointerId, active: false, timer: 0 };
    d.timer = window.setTimeout(() => {
      d.active = true;
      setDragging(d.id);
      navigator.vibrate?.(15);
      try {
        toolsRef.current?.setPointerCapture(d.pointer);
      } catch {
        /* ignore */
      }
    }, 380);
    drag.current = d;
  }
  function onToolMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      // Moved before the hold: it's a scroll or a tap, not a drag.
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
        window.clearTimeout(d.timer);
        drag.current = null;
      }
      return;
    }
    const row = toolsRef.current;
    if (!row) return;
    // Near the ends, the row scrolls along.
    const box = row.getBoundingClientRect();
    if (e.clientX < box.left + 24) row.scrollLeft -= 8;
    else if (e.clientX > box.right - 24) row.scrollLeft += 8;
    const over = [...row.querySelectorAll<HTMLElement>("[data-tool]")].find((t) => {
      const r = t.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX < r.right;
    });
    const target = over?.dataset.tool;
    if (!target || target === d.id) return;
    setToolOrder((order) => {
      const next = order.filter((k) => k !== d.id);
      const at = next.indexOf(target);
      next.splice(order.indexOf(d.id) < order.indexOf(target) ? at + 1 : at, 0, d.id);
      return next;
    });
  }
  function onToolUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    window.clearTimeout(d.timer);
    if (d.active) {
      justDragged.current = true;
      setDragging(null);
    }
  }

  const anchorForDate = () => {
    const r = dateChip.current?.getBoundingClientRect();
    if (dialog) return { top: Math.min((r?.bottom ?? 200) + 6, window.innerHeight - 480), right: Math.max(8, window.innerWidth - (r?.right ?? 300) - 120) };
    return { top: Math.max(8, (r?.top ?? 400) - 450), right: Math.max(8, window.innerWidth - (r?.right ?? 300)) };
  };

  return createPortal(
    <div className={`qas-scrim ${dialog ? "qas-dialog-scrim" : ""}`} onClick={onClose}>
      <div className={`qas-card ${dialog ? "qas-dialog" : `qab ${addStyle === "tabs" ? "qab-anim-grow" : "qab-anim-rise"}`}`} style={dialog ? undefined : { marginBottom: keyboard }} onClick={(e) => e.stopPropagation()} onPointerDownCapture={() => (lastTouch.current = Date.now())} role="dialog" aria-label="Add task">
        {added && <div className="qas-added">{added}</div>}
        {/* What was read as a date, time, p1, #project... shows highlighted: the
            text is drawn by the copy behind the (see-through) field. */}
        <div className="qas-head">
          <div className="qas-title-wrap">
            <div ref={mirror} className="qas-title qas-title-mirror" aria-hidden="true">
              {preview
                ? highlightParts(text, preview.content).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text))
                : text}
            </div>
            <input
              ref={title}
              className="qas-title qas-title-input"
              // Long names scroll sideways: the copy behind follows.
              onScroll={(e) => {
                if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft;
              }}
              onSelect={(e) => {
                if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft;
              }}
              autoFocus
              placeholder="Task name"
              value={text}
              enterKeyHint="send"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
                if (e.key === "Escape") onClose();
              }}
            />
          </div>
          {/* The website's window: the mic up here, standing out as in the app. */}
          {dialog && (
            <MicButton
              className="qas-mic"
              autoStart={listenOnOpen}
              onText={(said) => setText((t) => (t.trim() ? t.trim() + " " : "") + said)}
            />
          )}
        </div>
        {description !== null && (
          <textarea
            className="qas-desc"
            // Picked from the + menu in the app: straight into it. The website's
            // window always shows it, and starts in the task's name.
            autoFocus={false}
            rows={1}
            placeholder="Description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
          />
        )}

        {/* The app: what's set as tokens (tap to change, × to clear), then one
            row of same-size icons, where it goes on the left, send on the right. */}
        {!dialog && tokens.length > 0 && (
          <div className="qab-tokens">
            {tokens.map((t) => (
              <span key={t.key} className="qab-token" style={t.color ? { color: t.color, background: `color-mix(in srgb, ${t.color} 13%, transparent)` } : undefined}>
                <button type="button" className="qab-token-main" onClick={t.open}>
                  {t.label}
                </button>
                <button type="button" className="qab-token-x" onClick={t.clear} aria-label={`Clear ${t.label}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {!dialog && (
          <div className="qab-bar">
            <button
              type="button"
              className="qab-where"
              onClick={() => {
                setMenu(false);
                setWhere((w) => !w);
              }}
              aria-label={`Where it goes: ${target.label}`}
              aria-expanded={where}
            >
              {isInbox ? <InboxIcon width={17} height={17} /> : <span className="qas-hash">#</span>}
              <span>{target.label.split(" / ")[0]}</span>
            </button>
            <div
              ref={toolsRef}
              className={`qab-tools ${dragging ? "is-sorting" : ""}`}
              onPointerDown={onToolDown}
              onPointerMove={onToolMove}
              onPointerUp={onToolUp}
              onPointerCancel={onToolUp}
              onClickCapture={(e) => {
                // The tap that ends a drag doesn't open that icon's picker.
                if (justDragged.current) {
                  justDragged.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              {toolOrder.map((id) => {
                const el = toolEls[id];
                return el ? (
                  <span key={id} data-tool={id} className={`qab-slot ${dragging === id ? "is-dragging" : ""}`}>
                    {el}
                  </span>
                ) : null;
              })}
            </div>
            {text.trim() ? (
              <button type="button" className="qas-send qab-send" onClick={() => void submit()} aria-label="Add task">
                <SendIcon />
              </button>
            ) : (
              <MicButton
                className="qas-send qab-send"
                autoStart={listenOnOpen}
                onText={(said) => {
                  setText((t) => (t.trim() ? t.trim() + " " : "") + said);
                  // Only into the field: check it, then send (or keep talking).
                  title.current?.focus();
                }}
              />
            )}
          </div>
        )}
        {dialog && (
        <div className="qas-bar">
            <div className="qas-chips">
              {!dialog && (
                <>
              <button
                type="button"
                className="qas-chip is-icon"
                onClick={() => {
                  setWhere(false);
                  setMenu((m) => !m);
                }}
                aria-label="More"
              >
                <PlusIcon width={20} height={20} />
              </button>
  
              {/* Just the project here; its sections are in the list this opens. */}
              <button
                type="button"
                className="qas-chip"
                onClick={() => {
                  setMenu(false);
                  setWhere((w) => !w);
                }}
                aria-label={`Where it goes: ${target.label}`}
                aria-expanded={where}
              >
                {isInbox ? <InboxIcon width={20} height={20} /> : <span className="qas-hash">#</span>}
                <span>{target.label.split(" / ")[0]}</span>
              </button>
  
                </>
              )}
  
              <button ref={dateChip} type="button" className="qas-chip" style={{ color: dueColor }} onClick={() => setPicking("date")}>
                <CalendarIcon width={20} height={20} />
                {baseDue ? formatDueLabel(baseDue) : "Date"}
              </button>
  
              {usingFirebase() && (
                <button
                  type="button"
                  className="qas-chip"
                  style={file ? { color: "var(--color-accent)" } : undefined}
                  onClick={() => (file ? setFile(null) : fileInput.current?.click())}
                  title={file ? "Tap to remove" : "Attach a photo or file"}
                >
                  <AttachIcon />
                  {file ? file.name : "Attachment"}
                </button>
              )}
  
              <label className="qas-chip" style={effectivePriority !== 1 ? { color: PRIORITY_META[effectivePriority].color } : undefined}>
                <FlagIcon width={20} height={20} />
                <span>{effectivePriority !== 1 ? `P${5 - effectivePriority}` : "Priority"}</span>
                <Select
                  value={effectivePriority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  aria-label="Priority"
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </Select>
              </label>
  
              <label className="qas-chip" style={repeat !== "none" ? { color: "var(--color-accent)" } : undefined}>
                <RepeatIcon width={20} height={20} />
                <span>{repeat === "none" ? "Repeat" : REPEAT_PRESETS.find((p) => p.key === repeat)?.label}</span>
                <Select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatPreset | "none")} aria-label="Repeat">
                  <option value="none">Doesn't repeat</option>
                  {REPEAT_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </label>
  
              {partner && (
                <button
                  type="button"
                  className={`qas-chip ${shared ? "is-on" : ""}`}
                  onClick={() => setShared((s) => !s)}
                  aria-pressed={shared}
                >
                  <ShareIcon width={20} height={20} />
                  {shared ? `With ${partner.name.split(" ")[0]}` : "Share"}
                </button>
              )}
  
              {dialog && allLabels.length === 0 && (
                <button type="button" className="qas-chip" onClick={() => setPicking("labels")}>
                  <TagIcon width={20} height={20} />
                  Labels
                </button>
              )}
              {dialog && !location && (
                <button type="button" className="qas-chip" onClick={() => setPicking("location")}>
                  <MapPinIcon width={20} height={20} />
                  Location
                </button>
              )}
              {allLabels.length > 0 && (
                <button type="button" className="qas-chip is-on" onClick={() => setPicking("labels")}>
                  <TagIcon width={20} height={20} />@{allLabels.join(" @")}
                </button>
              )}
              {location && (
                <button type="button" className="qas-chip is-on" onClick={() => setPicking("location")}>
                  <MapPinIcon width={20} height={20} />
                  {location.name}
                </button>
              )}
              {dialog && !reminders?.length && (
                <button type="button" className="qas-chip" onClick={() => setPicking("reminders")}>
                  <BellIcon width={20} height={20} />
                  Reminders
                </button>
              )}
              {reminders && reminders.length > 0 && (
                <button type="button" className="qas-chip is-on" onClick={() => setPicking("reminders")}>
                  <BellIcon width={20} height={20} />
                  {shortReminder(reminders[0])}
                  {reminders.length > 1 ? ` +${reminders.length - 1}` : ""}
                </button>
              )}
            </div>
  
            {dialog ? null : text.trim() ? (
              <button type="button" className="qas-send" onClick={() => void submit()} aria-label="Add task">
                <SendIcon />
              </button>
            ) : (
              <MicButton
                className="qas-send"
                autoStart={listenOnOpen}
                onText={(said) => {
                  setText((t) => (t.trim() ? t.trim() + " " : "") + said);
                  // Only into the field: check it, then send (or keep talking).
                  title.current?.focus();
                }}
              />
            )}
          </div>
        )}
        {dialog && (
          <div className="qas-footer">
            {/* Just the project here; its sections are in the list this opens. */}
            <button
              type="button"
              className="qas-chip qas-where-chip"
              onClick={() => {
                setMenu(false);
                setWhere((w) => !w);
              }}
              aria-label={`Where it goes: ${target.label}`}
              aria-expanded={where}
            >
              {isInbox ? <InboxIcon width={20} height={20} /> : <span className="qas-hash">#</span>}
              <span>{target.label.split(" / ")[0]}</span>
            </button>

            <div className="qas-footer-actions">
              <button type="button" className="btn btn-text" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={!preview?.content}>
                Add task
              </button>
            </div>
          </div>
        )}

        {where && (
          <div className="qas-menu qas-where" role="listbox" aria-label="Where it goes">
            {places.map((t) => (
              <button
                key={t.key}
                type="button"
                role="option"
                aria-selected={t.key === target.key}
                className={`${t.sectionId ? "is-section" : ""} ${t.key === target.key ? "is-current" : ""}`}
                onClick={() => {
                  setTargetKey(t.key);
                  setWhere(false);
                  title.current?.focus();
                }}
              >
                {t.sectionId ? <SectionIcon /> : t.isInbox ? <InboxIcon width={20} height={20} /> : <span className="qas-hash">#</span>}
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        )}

        {menu && (
          <div className="qas-menu" onClick={() => setMenu(false)}>
            {menuItems.map((m) => (
              <button key={m.label} type="button" onClick={m.run}>
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>

      {picking === "date" && (
        <DatePickerPopup value={baseDue} onPick={setPicked} anchor={anchorForDate()} onClose={() => setPicking(null)} />
      )}
      {picking === "reminders" && (
        <ReminderSheet
          due={applyRecurrence(baseDue, repeat)}
          reminders={reminders ?? []}
          me={data?.me}
          onChange={setReminders}
          onClose={() => setPicking(null)}
        />
      )}
      {picking === "location" && (
        <div onClick={(e) => e.stopPropagation()}>
          <LocationPicker
            initial={location ?? undefined}
            onClose={() => setPicking(null)}
            onSave={(loc) => {
              setLocation(loc);
              setPicking(null);
            }}
          />
        </div>
      )}
      {picking === "labels" && (
        <LabelPicker
          all={(data?.labels ?? []).map((l) => l.name)}
          chosen={labels}
          onDone={(next) => {
            setLabels(next);
            setPicking(null);
          }}
        />
      )}
    </div>,
    document.body
  );
}

/** Tick labels for the new task, or type a new one. */
function LabelPicker({ all, chosen, onDone }: { all: string[]; chosen: string[]; onDone: (labels: string[]) => void }) {
  const [on, setOn] = useState<string[]>(chosen);
  const [fresh, setFresh] = useState("");
  const names = [...new Set([...all, ...on])];
  function addFresh() {
    const name = fresh.trim().replace(/^@/, "");
    if (name && !on.includes(name)) setOn([...on, name]);
    setFresh("");
  }
  return (
    <div className="modal-backdrop over-modal" onClick={(e) => (e.stopPropagation(), onDone(on))}>
      <div className="modal qas-labels" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Labels">
        <h3>Labels</h3>
        <div className="qas-label-list">
          {names.map((n) => (
            <label key={n} className="qas-label-row">
              <input type="checkbox" checked={on.includes(n)} onChange={(e) => setOn(e.target.checked ? [...on, n] : on.filter((x) => x !== n))} />
              @{n}
            </label>
          ))}
        </div>
        <input
          className="qas-label-new"
          placeholder="New label"
          value={fresh}
          onChange={(e) => setFresh(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFresh()}
        />
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => (addFresh(), onDone(fresh.trim() ? [...on, fresh.trim()] : on))}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
