import { tr, format } from "../i18n";
import { CouchIcon, MoreIcon, SkipForwardIcon, SunIcon } from "./icons";
import { weekendOffsetDays } from "../utils/quickDates";

/**
 * The four quick-pick date buttons (Today/Tomorrow/This weekend/Next week),
 * icon-only like Todoist's, plus an optional "…" that opens the full date
 * picker. Shared between the per-task "⋯" menu and the task detail sidebar.
 */
export default function DateQuickIcons({
  onPick,
  onMore,
}: {
  onPick: (days: number) => void;
  onMore?: () => void;
}) {
  return (
    <div className="date-quick-icons">
      <button
        type="button"
        className="date-quick-btn today"
        title={tr("Today", "Danes")}
        onClick={() => onPick(0)}
      >
        {format(new Date(), "d")}
      </button>
      <button type="button" className="date-quick-btn tomorrow" title={tr("Tomorrow", "Jutri")} onClick={() => onPick(1)}>
        <SunIcon width={15} height={15} />
      </button>
      <button
        type="button"
        className="date-quick-btn weekend"
        title={tr("This weekend", "Ta vikend")}
        onClick={() => onPick(weekendOffsetDays())}
      >
        <CouchIcon width={15} height={15} />
      </button>
      <button type="button" className="date-quick-btn nextweek" title={tr("Next week", "Naslednji teden")} onClick={() => onPick(7)}>
        <SkipForwardIcon width={15} height={15} />
      </button>
      {onMore && (
        <button type="button" className="date-quick-btn more" title={tr("More date options", "Več možnosti datuma")} onClick={onMore}>
          <MoreIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}
