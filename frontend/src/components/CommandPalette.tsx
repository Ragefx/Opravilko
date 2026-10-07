import { tr } from "../i18n";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { openThisMonth } from "../utils/calendarTasks";
import { shoppingListOf } from "../utils/shopping";
import { useNavigate } from "react-router-dom";
import { useBootstrap, useCreateTask } from "../api/hooks";
import { colorHex } from "../utils/colors";
import { formatDueLabel } from "../utils/date";
import { parseQuickAddInput } from "../utils/quickAddParse";
import {
  ChartIcon,
  CheckCircleIcon,
  FilterIcon,
  FocusIcon,
  HashIcon,
  CalendarIcon,
  CartIcon,
  InboxIcon,
  LabelIcon,
  PlusIcon,
  SettingsIcon,
  ShareIcon,
  TodayIcon,
  UpcomingIcon,
} from "./icons";
import { useToast } from "./ToastProvider";
import { OPEN_WEEKLY_REVIEW } from "./WeeklyReview";
import { useWeeklyReview } from "../utils/weeklyReview";

interface Command {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

/**
 * The Soča look's one box for getting around: type to jump to a view,
 * project, label, filter or task -- or add what you typed as a new task
 * (same "tomorrow p1 #Project @label" syntax as quick add).
 */
export default function CommandPalette({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const { data } = useBootstrap();
  const navigate = useNavigate();
  const createTask = useCreateTask();
  const showToast = useToast();
  const reviewOn = useWeeklyReview();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    if (!data) return [];
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };
    const q = query.trim().toLowerCase();
    const matches = (s: string) => !q || s.toLowerCase().includes(q);
    const open = data.tasks.filter((t) => !t.completed);
    const countIn = (projectId: string) => open.filter((t) => t.projectId === projectId).length;

    const views: Command[] = [
      { key: "v-home", group: tr("Go to", "Pojdi na"), label: tr("Now · Next · Later", "Zdaj · Naslednje · Pozneje"), icon: <FocusIcon width={16} height={16} />, run: go("/app/home") },
      { key: "v-today", group: tr("Go to", "Pojdi na"), label: tr("Today", "Danes"), icon: <TodayIcon width={16} height={16} />, run: go("/app/today") },
      ...(data.me ? [{ key: "v-midva", group: tr("Go to", "Pojdi na"), label: tr("Midva", "Midva"), icon: <ShareIcon width={16} height={16} />, run: go("/app/midva") }] : []),
      { key: "v-upcoming", group: tr("Go to", "Pojdi na"), label: tr("Upcoming", "Prihajajoče"), icon: <UpcomingIcon width={16} height={16} />, run: go("/app/upcoming") },
      { key: "v-inbox", group: tr("Go to", "Pojdi na"), label: tr("Inbox", "Prejeto"), hint: String(countIn("inbox")), icon: <InboxIcon width={16} height={16} />, run: go("/app/inbox") },
      { key: "v-calendar", group: tr("Go to", "Pojdi na"), label: tr("Calendar", "Koledar"), hint: String(openThisMonth(data)), icon: <CalendarIcon width={16} height={16} />, run: go("/app/calendar") },
      { key: "v-shopping", group: tr("Go to", "Pojdi na"), label: tr("Shopping", "Nakupi"), icon: <CartIcon width={16} height={16} />, run: go("/app/shopping") },
      { key: "v-completed", group: tr("Go to", "Pojdi na"), label: tr("Completed", "Opravljeno"), icon: <CheckCircleIcon width={16} height={16} />, run: go("/app/completed") },
      { key: "v-stats", group: tr("Go to", "Pojdi na"), label: tr("Productivity", "Produktivnost"), icon: <ChartIcon width={16} height={16} />, run: go("/app/stats") },
      ...(reviewOn
        ? [
            {
              key: "v-review",
              group: tr("Go to", "Pojdi na"),
              label: tr("Weekly review", "Tedenski pregled"),
              icon: <CalendarIcon width={16} height={16} />,
              run: () => {
                onClose();
                window.dispatchEvent(new Event(OPEN_WEEKLY_REVIEW));
              },
            },
          ]
        : []),
      {
        key: "v-settings",
        group: tr("Go to", "Pojdi na"),
        label: tr("Settings", "Nastavitve"),
        icon: <SettingsIcon width={16} height={16} />,
        run: () => {
          onClose();
          onOpenSettings();
        },
      },
    ].filter((c) => matches(c.label));

    const shoppingId = shoppingListOf(data.projects)?.id;
    const projects: Command[] = data.projects
      .filter((p) => !p.isInboxProject && p.id !== shoppingId && matches(p.name))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.order - b.order)
      .map((p) => ({
        key: `p-${p.id}`,
        group: tr("Projects", "Projekti"),
        label: p.name,
        hint: String(countIn(p.id)),
        icon: <HashIcon width={16} height={16} style={{ color: colorHex(p.color) }} />,
        run: go(`/app/project/${p.id}`),
      }));

    const labels: Command[] = data.labels
      .filter((l) => matches(l.name))
      .map((l) => ({
        key: `l-${l.id}`,
        group: tr("Labels", "Oznake"),
        label: l.name,
        icon: <LabelIcon width={16} height={16} style={{ color: colorHex(l.color) }} />,
        run: go(`/app/label/${encodeURIComponent(l.name)}`),
      }));

    const filters: Command[] = data.filters
      .filter((f) => matches(f.name))
      .map((f) => ({
        key: `f-${f.id}`,
        group: tr("Filters", "Filtri"),
        label: f.name,
        icon: <FilterIcon width={16} height={16} style={{ color: colorHex(f.color) }} />,
        run: go(`/app/filter/${f.id}`),
      }));

    const tasks: Command[] = q
      ? open
          .filter((t) => t.content.toLowerCase().includes(q))
          .slice(0, 8)
          .map((t) => ({
            key: `t-${t.id}`,
            group: tr("Tasks", "Naloge"),
            label: t.content,
            hint: t.due ? formatDueLabel(t.due) : undefined,
            icon: <span className="cmd-ring" />,
            run: go(
              t.projectId === "inbox"
                ? `/app/inbox?open=${encodeURIComponent(t.id)}`
                : `/app/project/${t.projectId}?open=${encodeURIComponent(t.id)}`
            ),
          }))
      : [];

    const add: Command[] = [];
    if (q) {
      const parsed = parseQuickAddInput(query);
      if (parsed.content) {
        const project = parsed.projectName
          ? data.projects.find((p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase())
          : undefined;
        const share = parsed.shared && data.partner ? data.partner : null;
        const bits = [project?.name || tr("Inbox", "Prejeto"), parsed.due ? formatDueLabel(parsed.due) : null, share ? "Midva" : null].filter(Boolean);
        add.push({
          key: "add",
          group: tr("New task", "Nova naloga"),
          label: tr(`Add “${parsed.content}”`, `Dodaj »${parsed.content}«`),
          hint: bits.join(" · "),
          icon: <PlusIcon width={16} height={16} />,
          run: () => {
            createTask.mutate(
              {
                content: parsed.content,
                projectId: project?.id || "inbox",
                priority: parsed.priority,
                due: parsed.due,
                labels: parsed.labels,
                ...(parsed.deadline ? { deadline: parsed.deadline } : {}),
                sharedWith: share ? [share.uid] : undefined,
              },
              { onSuccess: () => showToast({ message: tr(`Added to ${project?.name || "Inbox"}`, `Dodano v ${project?.name || "Prejeto"}`) }) }
            );
            onClose();
          },
        });
      }
    }

    // Typing usually means "take me there", so places come first when any
    // match; otherwise Enter adds what you typed as a task.
    const places = [...views, ...projects, ...labels, ...filters];
    return places.length ? [...places, ...add, ...tasks] : [...add, ...tasks];
  }, [data, query, navigate, onClose, onOpenSettings, createTask, showToast, reviewOn]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(commands.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commands[active]?.run();
    }
  }

  let lastGroup = "";
  return (
    <div className="modal-backdrop cmd-backdrop" onClick={onClose}>
      <div className="modal cmd-palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="text"
          className="cmd-input"
          placeholder={tr("Jump to a project, or type a new task…", "Skoči na projekt ali vpiši novo nalogo …")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={tr("Command", "Ukaz")}
        />
        <div className="cmd-list" ref={listRef}>
          {commands.map((c, i) => {
            const heading = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.key}>
                {heading && <div className="cmd-group">{heading}</div>}
                <button
                  data-index={i}
                  className={`cmd-item ${i === active ? "is-active" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => c.run()}
                >
                  <span className="cmd-icon">{c.icon}</span>
                  <span className="cmd-label">{c.label}</span>
                  {c.hint && <span className="cmd-hint">{c.hint}</span>}
                </button>
              </div>
            );
          })}
          {commands.length === 0 && <div className="cmd-empty">{tr(`Nothing matches “${query}”.`, `Nič se ne ujema z »${query}«.`)}</div>}
        </div>
        <div className="cmd-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {tr("move", "premik")}
          </span>
          <span>
            <kbd>Enter</kbd> {tr("open", "odpri")}
          </span>
          <span>
            <kbd>Esc</kbd> {tr("close", "zapri")}
          </span>
        </div>
      </div>
    </div>
  );
}
