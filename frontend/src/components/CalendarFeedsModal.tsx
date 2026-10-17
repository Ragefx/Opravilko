import { tr, localeTag } from "../i18n";
import { useEffect, useState } from "react";
import {
  useBootstrap,
  useCreateCalendarFeed,
  useDeleteCalendarFeed,
  useSyncCalendarFeed,
  useUpdateCalendarFeed,
} from "../api/hooks";
import type { CalendarFeed } from "../api/types";
import { COLOR_NAMES, colorHex } from "../utils/colors";
import { RefreshIcon, TrashIcon } from "./icons";
import { useToast } from "./ToastProvider";

/**
 * Subscribed external calendars (TV listings, Gmail holiday/birthday feeds,
 * ...): read-only .ics feeds shown alongside tasks in Today/Upcoming/Calendar,
 * never turned into tasks themselves. Manage add/remove/refresh here.
 */
export default function CalendarFeedsModal({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const { data } = useBootstrap();
  const createFeed = useCreateCalendarFeed();
  const updateFeed = useUpdateCalendarFeed();
  const deleteFeed = useDeleteCalendarFeed();
  const syncFeed = useSyncCalendarFeed();
  const showToast = useToast();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState("violet");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const feeds = data?.calendarFeeds || [];

  function addFeed() {
    if (!name.trim() || !url.trim()) return;
    createFeed.mutate(
      { name: name.trim(), url: url.trim(), color: colorHex(color) },
      {
        onSuccess: (feed) => {
          setName("");
          setUrl("");
          void refresh(feed.id);
        },
      }
    );
  }

  async function refresh(id: string) {
    setSyncingId(id);
    try {
      await syncFeed.mutateAsync(id);
      showToast({ message: tr("Calendar synced", "Koledar usklajen") });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : tr("Sync failed", "Usklajevanje ni uspelo") });
    } finally {
      setSyncingId(null);
    }
  }

  return (
    // Embedded: shown inside Settings, without its own dialog frame, title or close button.
    <Frame embedded={embedded} onClose={onClose}>
        {!embedded && <h3>{tr("Calendars", "Koledarji")}</h3>}
        <p className="import-help">
          {tr(
            "Show another calendar next to your tasks: a TV listing, holidays, birthdays… Paste its .ics address (in Google Calendar: the calendar's settings, \"Secret address in iCal format\"). Its events only show; they never become tasks.",
            "Prikaži še drug koledar ob svojih nalogah: TV spored, praznike, rojstne dni … Prilepi njegov naslov .ics (v Google Koledarju: nastavitve koledarja, »Skrivni naslov v obliki iCal«). Njegovi dogodki se le prikažejo; nikoli ne postanejo naloge."
          )}
        </p>

        {feeds.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {feeds.map((feed) => (
              <CalendarFeedRow
                key={feed.id}
                feed={feed}
                syncing={syncingId === feed.id}
                onToggle={(enabled) => updateFeed.mutate({ id: feed.id, enabled })}
                onRename={(newName) => updateFeed.mutate({ id: feed.id, name: newName })}
                onRefresh={() => refresh(feed.id)}
                onDelete={() => deleteFeed.mutate(feed.id)}
              />
            ))}
          </div>
        )}

        <div className="import-help" style={{ fontWeight: 700, color: "var(--color-text)", marginBottom: 8 }}>
          {tr("Add a calendar", "Dodaj koledar")}
        </div>
        <input
          type="text"
          placeholder={tr("Name, e.g. TV Shows", "Ime, npr. TV oddaje")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          placeholder="https://.../calendar.ics"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="color-swatch-grid" style={{ marginBottom: 12 }}>
          {COLOR_NAMES.map((c) => (
            <button
              key={c}
              className={`color-swatch ${color === c ? "selected" : ""}`}
              style={{ background: colorHex(c) }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>

        <div className="modal-actions">
          {!embedded && (
            <button className="btn btn-text" onClick={onClose}>
              {tr("Close", "Zapri")}
            </button>
          )}
          <button className="btn btn-primary" onClick={addFeed} disabled={!name.trim() || !url.trim()}>
            {tr("Add calendar", "Dodaj koledar")}
          </button>
        </div>
    </Frame>
  );
}

function CalendarFeedRow({
  feed,
  syncing,
  onToggle,
  onRename,
  onRefresh,
  onDelete,
}: {
  feed: CalendarFeed;
  syncing: boolean;
  onToggle: (enabled: boolean) => void;
  onRename: (name: string) => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(feed.name);

  useEffect(() => {
    setName(feed.name);
  }, [feed.name]);

  function saveName() {
    setRenaming(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === feed.name) {
      setName(feed.name);
      return;
    }
    onRename(trimmed);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: feed.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {renaming ? (
          <input
            autoFocus
            style={{ fontSize: 13, fontWeight: 600, padding: "1px 4px", width: "100%" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(feed.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <div
            onClick={() => setRenaming(true)}
            style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}
            title={tr("Click to rename", "Klikni za preimenovanje")}
          >
            {feed.name}
          </div>
        )}
        <div style={{ fontSize: 11, color: feed.lastError ? "var(--color-danger)" : "var(--color-text-muted)" }}>
          {feed.lastError
            ? feed.lastError
            : feed.lastSyncedAt
              ? tr("Synced ", "Usklajeno ") + new Date(feed.lastSyncedAt).toLocaleString(localeTag)
              : tr("Not synced yet", "Še ni usklajeno")}
        </div>
      </div>
      <button
        className="row-menu-trigger"
        style={{ opacity: 1 }}
        onClick={onRefresh}
        disabled={syncing}
        aria-label={tr("Refresh", "Osveži")}
        title={tr("Refresh now", "Osveži zdaj")}
      >
        <RefreshIcon width={14} height={14} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} />
      </button>
      <input type="checkbox" className="switch" checked={feed.enabled} onChange={(e) => onToggle(e.target.checked)} />
      <button
        className="row-menu-trigger"
        style={{ opacity: 1, color: "var(--color-danger)" }}
        onClick={onDelete}
        aria-label={tr("Remove calendar", "Odstrani koledar")}
        title={tr("Remove", "Odstrani")}
      >
        <TrashIcon width={14} height={14} />
      </button>
    </div>
  );
}

function Frame({ embedded, onClose, children }: { embedded: boolean; onClose: () => void; children: React.ReactNode }) {
  if (embedded) return <div className="settings-embedded">{children}</div>;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
