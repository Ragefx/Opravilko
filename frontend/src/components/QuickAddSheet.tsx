import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { useAddAttachments, useBootstrap, useCreateTask } from "../api/hooks";
import type { Due, Task, TaskLocation } from "../api/types";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { formatDueLabel, todayISO } from "../utils/date";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { type RepeatPreset, REPEAT_PRESETS, applyRecurrence } from "../utils/recurrence";
import { addTargets, firstTargetIn } from "../utils/addTargets";
import { hasPendingWrite, usingFirebase } from "../data/store";
import { uploadAttachment } from "../firebase/attachments";
import { useKeyboardInset } from "../native/keyboard";
import DatePickerPopup from "./DatePickerPopup";
import LocationPicker from "./LocationPicker";
import MicButton from "./MicButton";
import { useToast } from "./ToastProvider";
import { CalendarIcon, FlagIcon, InboxIcon, MapPinIcon, PlusIcon, RepeatIcon, ShareIcon, TagIcon } from "./icons";

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
const SendIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

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
  const partner = data?.partner;
  const projects = data?.projects ?? [];

  const targets = addTargets(data);
  const [targetKey, setTargetKey] = useState(() => firstTargetIn(targets, defaultProjectId).key);
  const [text, setText] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [picked, setPicked] = useState<Due | null | undefined>(undefined);
  const [priority, setPriority] = useState<number | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [location, setLocation] = useState<TaskLocation | null>(null);
  const [repeat, setRepeat] = useState<RepeatPreset | "none">("none");
  const [shared, setShared] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState<null | "date" | "labels" | "location">(null);
  const dateChip = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLInputElement>(null);

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
  const chosen = targets.find((t) => t.key === targetKey) ?? targets[0];
  const choices = typedProject ? targets.filter((t) => t.projectId === typedProject.id) : targets;
  const target =
    typedProject && chosen.projectId !== typedProject.id
      ? choices[0] ?? { key: `${typedProject.id}:`, projectId: typedProject.id, sectionId: null, label: typedProject.name }
      : chosen;
  const effectivePriority = (preview && preview.priority !== 1 ? preview.priority : priority ?? 1) as Task["priority"];
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
      sharedWith: isShared && partner ? [partner.uid] : undefined,
    });
    setAdded(`✓ ${preview.content} → ${target.label}`);
    // Ready for the next one: the name and the extras go, where and when stay.
    setText("");
    setDescription(null);
    setPriority(null);
    setLabels([]);
    setLocation(null);
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

  const dueColor = !baseDue ? undefined : baseDue.date < todayISO() ? "var(--color-danger)" : "var(--color-accent)";
  const menuItems: { label: string; icon: ReactNode; run: () => void }[] = [
    { label: "Description", icon: <NotesIcon />, run: () => setDescription((d) => d ?? "") },
    { label: "Labels", icon: <TagIcon width={20} height={20} />, run: () => setPicking("labels") },
    { label: "Location", icon: <MapPinIcon width={20} height={20} />, run: () => setPicking("location") },
  ];

  const anchorForDate = () => {
    const r = dateChip.current?.getBoundingClientRect();
    return { top: Math.max(8, (r?.top ?? 400) - 450), right: Math.max(8, window.innerWidth - (r?.right ?? 300)) };
  };

  return createPortal(
    <div className="qas-scrim" onClick={onClose}>
      <div className="qas-card" style={{ marginBottom: keyboard }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add task">
        {added && <div className="qas-added">{added}</div>}
        <input
          ref={title}
          className="qas-title"
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
        {description !== null && (
          <textarea
            className="qas-desc"
            autoFocus
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

        <div className="qas-bar">
          <div className="qas-chips">
            <button type="button" className="qas-chip is-icon" onClick={() => setMenu((m) => !m)} aria-label="More">
              <PlusIcon width={20} height={20} />
            </button>

            <label className="qas-chip">
              {isInbox ? <InboxIcon width={20} height={20} /> : <span className="qas-hash">#</span>}
              <span>{target.label}</span>
              <select value={target.key} onChange={(e) => setTargetKey(e.target.value)} aria-label="Where it goes">
                {(choices.length ? choices : [target]).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

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
              <select
                value={effectivePriority}
                onChange={(e) => setPriority(Number(e.target.value))}
                aria-label="Priority"
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="qas-chip" style={repeat !== "none" ? { color: "var(--color-accent)" } : undefined}>
              <RepeatIcon width={20} height={20} />
              <span>{repeat === "none" ? "Repeat" : REPEAT_PRESETS.find((p) => p.key === repeat)?.label}</span>
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatPreset | "none")} aria-label="Repeat">
                <option value="none">Doesn't repeat</option>
                {REPEAT_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
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
          </div>

          {text.trim() ? (
            <button type="button" className="qas-send" onClick={() => void submit()} aria-label="Add task">
              <SendIcon />
            </button>
          ) : (
            <MicButton
              className="qas-send"
              autoStart={listenOnOpen}
              onText={(said) => setText((t) => (t.trim() ? t.trim() + " " : "") + said)}
            />
          )}
        </div>

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
