import { useState } from "react";
import {
  useBootstrap,
  useCreateCalendarFeed,
  useDeleteCalendarFeed,
  useSyncCalendarFeed,
  useUpdateCalendarFeed,
} from "../api/hooks";
import type { CalendarFeed } from "../api/types";
import { COLOR_NAMES, colorHex } from "../utils/colors";
import { CORS_PROXY_NAME } from "../utils/calendarSync";
import { RefreshIcon, TrashIcon } from "./icons";
import { useToast } from "./ToastProvider";

/**
 * Subscribed external calendars (TV listings, Gmail holiday/birthday feeds,
 * ...): read-only .ics feeds shown alongside tasks in Today/Upcoming/Calendar,
 * never turned into tasks themselves. Manage add/remove/refresh here.
 */
export default function CalendarFeedsModal({ onClose }: { onClose: () => void }) {
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
      showToast({ message: "Calendar synced" });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Calendars</h3>
        <p className="import-help">
          Subscribe to a read-only .ics feed (a TV listing calendar, a Gmail holiday or birthday
          calendar's "Secret address in iCal format", ...). These show up as events alongside your
          tasks in Today, Upcoming and Calendar view -- they're never turned into tasks, and there's
          nothing here to check off. Fetching a feed routes it through the public relay{" "}
          <strong>{CORS_PROXY_NAME}</strong> (browsers can't fetch most feeds directly); for a
          private link that's worth knowing before you add it.
        </p>

        {feeds.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {feeds.map((feed) => (
              <CalendarFeedRow
                key={feed.id}
                feed={feed}
                syncing={syncingId === feed.id}
                onToggle={(enabled) => updateFeed.mutate({ id: feed.id, enabled })}
                onRefresh={() => refresh(feed.id)}
                onDelete={() => deleteFeed.mutate(feed.id)}
              />
            ))}
          </div>
        )}

        <div className="import-help" style={{ fontWeight: 700, color: "var(--color-text)", marginBottom: 8 }}>
          Add a calendar
        </div>
        <input
          type="text"
          placeholder="Name, e.g. TV Shows"
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
          <button className="btn btn-text" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={addFeed} disabled={!name.trim() || !url.trim()}>
            Add calendar
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarFeedRow({
  feed,
  syncing,
  onToggle,
  onRefresh,
  onDelete,
}: {
  feed: CalendarFeed;
  syncing: boolean;
  onToggle: (enabled: boolean) => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: feed.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {feed.name}
        </div>
        <div style={{ fontSize: 11, color: feed.lastError ? "var(--color-danger)" : "var(--color-text-muted)" }}>
          {feed.lastError
            ? feed.lastError
            : feed.lastSyncedAt
              ? `Synced ${new Date(feed.lastSyncedAt).toLocaleString()}`
              : "Not synced yet"}
        </div>
      </div>
      <button
        className="row-menu-trigger"
        style={{ opacity: 1 }}
        onClick={onRefresh}
        disabled={syncing}
        aria-label="Refresh"
        title="Refresh now"
      >
        <RefreshIcon width={14} height={14} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} />
      </button>
      <input type="checkbox" className="switch" checked={feed.enabled} onChange={(e) => onToggle(e.target.checked)} />
      <button
        className="row-menu-trigger"
        style={{ opacity: 1, color: "var(--color-danger)" }}
        onClick={onDelete}
        aria-label="Remove calendar"
        title="Remove"
      >
        <TrashIcon width={14} height={14} />
      </button>
    </div>
  );
}
