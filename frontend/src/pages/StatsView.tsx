import { useState } from "react";
import { isToday } from "date-fns";
import { tr, format, trn, localeTag } from "../i18n";
import { useBootstrap } from "../api/hooks";
import { colorHex } from "../utils/colors";
import type { AppData } from "../api/types";
import {
  activitySummary,
  allCompletions,
  countByDay,
  currentStreak,
  lastNDays,
  longestStreak,
  niceScale,
  totalsOf,
  type PersonTotals,
} from "../utils/stats";
import { shoppingListOf } from "../utils/shopping";

const CHART_DAYS = 14;

export default function StatsView() {
  const { data, isLoading } = useBootstrap();
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  if (isLoading || !data) return null;

  const entries = allCompletions(data);
  const byDay = countByDay(entries);
  const days = lastNDays(byDay, CHART_DAYS);
  const last7 = days.slice(-7).reduce((sum, d) => sum + d.count, 0);
  const prev7 = days.slice(0, 7).reduce((sum, d) => sum + d.count, 0);
  const today = days[days.length - 1].count;
  const streak = currentStreak(byDay);
  const best = longestStreak(byDay);
  const { top, step } = niceScale(Math.max(...days.map((d) => d.count)));
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  // Where the last 7 days' work went, busiest project first.
  const weekStart = days[days.length - 7].key;
  const perProject = new Map<string, number>();
  for (const e of entries) {
    if (format(new Date(e.at), "yyyy-MM-dd") >= weekStart) {
      perProject.set(e.projectId, (perProject.get(e.projectId) ?? 0) + 1);
    }
  }
  const projectRows = [...perProject.entries()]
    .map(([id, count]) => ({ project: data.projects.find((p) => p.id === id), count }))
    .filter((r) => r.project)
    .sort((a, b) => b.count - a.count);

  const delta = last7 - prev7;

  return (
    <div className="content-scroll">
      <div className="page-header">
        <div>
          <h1>{tr("Productivity", "Produktivnost")}</h1>
          <div className="page-subtitle">{tr("What you've been getting done", "Kaj vse si opravil(a)")}</div>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="stat-label">{tr("Current streak", "Trenutni niz")}</div>
          <div className="stat-value">{trn(streak, ["# day", "# days"], ["# dan", "# dneva", "# dnevi", "# dni"])}</div>
          <div className="stat-note">
            {tr("Best: ", "Najboljši: ")}
            {trn(best, ["# day", "# days"], ["# dan", "# dneva", "# dnevi", "# dni"])}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">{tr("Completed today", "Opravljeno danes")}</div>
          <div className="stat-value">{today}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">{tr("Last 7 days", "Zadnjih 7 dni")}</div>
          <div className="stat-value">{last7}</div>
          <div className={`stat-note ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
            {delta === 0
              ? tr("Same as previous 7 days", "Enako kot prejšnjih 7 dni")
              : tr(`${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs previous 7 days`, `${delta > 0 ? "+" : "−"}${Math.abs(delta)} glede na prejšnjih 7 dni`)}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">{tr("All time", "Vse skupaj")}</div>
          <div className="stat-value">{entries.length.toLocaleString(localeTag)}</div>
        </div>
      </div>

      {data.partner && <TwoOfUs data={data} />}

      <section className="stats-card">
        <div className="stats-card-header">
          <h2>{tr("Completed per day", "Opravljeno na dan")}</h2>
          <button className="btn-text stats-table-toggle" onClick={() => setShowTable((v) => !v)}>
            {showTable ? tr("Show chart", "Pokaži graf") : tr("Show as table", "Pokaži kot tabelo")}
          </button>
        </div>

        {showTable ? (
          <table className="stats-table">
            <thead>
              <tr>
                <th>{tr("Day", "Dan")}</th>
                <th>{tr("Completed", "Opravljeno")}</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.key}>
                  <td>{format(d.date, tr("EEE d MMM", "EEE, d. MMM"))}</td>
                  <td>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="col-chart" role="img" aria-label={tr(`Tasks completed per day over the last ${CHART_DAYS} days`, `Opravljene naloge na dan v zadnjih ${CHART_DAYS} dneh`)}>
            <div className="col-chart-yaxis">
              {[...ticks].reverse().map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="col-chart-plot">
              {ticks.map((t) => (
                <div key={t} className="col-chart-grid" style={{ bottom: `${(t / top) * 100}%` }} />
              ))}
              {days.map((d, i) => (
                <div
                  key={d.key}
                  className="col-chart-slot"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setHovered(hovered === i ? null : i)}
                >
                  {/* Only today's value is labeled; the axis and tooltip carry the rest. */}
                  {isToday(d.date) && d.count > 0 && (
                    <span className="col-chart-value" style={{ bottom: `calc(${(d.count / top) * 100}% + 4px)` }}>
                      {d.count}
                    </span>
                  )}
                  <div
                    className={`col-chart-bar ${hovered !== null && hovered !== i ? "dim" : ""}`}
                    style={{ height: `${(d.count / top) * 100}%` }}
                  />
                  {hovered === i && (
                    <div className={`col-chart-tooltip ${i > CHART_DAYS - 4 ? "align-right" : ""}`}>
                      <strong>{format(d.date, tr("EEE d MMM", "EEE, d. MMM"))}</strong>
                      {trn(d.count, ["# task completed", "# tasks completed"], ["# opravljena naloga", "# opravljeni nalogi", "# opravljene naloge", "# opravljenih nalog"])}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="col-chart-xaxis">
              {days.map((d, i) => (
                <span key={d.key}>{isToday(d.date) ? tr("Today", "Danes") : i % 2 === 1 ? format(d.date, "d") : ""}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="stats-card">
        <div className="stats-card-header">
          <h2>{tr("By project, last 7 days", "Po projektih, zadnjih 7 dni")}</h2>
        </div>
        {projectRows.length === 0 ? (
          <p className="stats-empty">{tr("Nothing completed in the last 7 days yet.", "V zadnjih 7 dneh še nič opravljenega.")}</p>
        ) : (
          <ul className="stats-project-list">
            {projectRows.map(({ project, count }) => (
              <li key={project!.id}>
                <span className="project-hash" style={{ color: colorHex(project!.color) }}>
                  #
                </span>
                <span className="stats-project-name">{project!.name}</span>
                <span className="stats-project-count">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const PAIR_DAYS = 14;

/** You and your partner side by side: who did most, day by day, and the shopping. */
function TwoOfUs({ data }: { data: AppData }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const partnerName = data.partner!.name.split(" ")[0] || tr("Partner", "Partner");
  const mine = totalsOf(activitySummary(data), PAIR_DAYS);
  const theirs = data.partnerActivity ? totalsOf(data.partnerActivity, PAIR_DAYS) : null;
  const people: { name: string; t: PersonTotals; cls: string }[] = [
    { name: tr("You", "Ti"), t: mine, cls: "is-me" },
    ...(theirs ? [{ name: partnerName, t: theirs, cls: "is-partner" }] : []),
  ];

  const leader = (pick: (t: PersonTotals) => number) => {
    if (!theirs) return null;
    const a = pick(mine);
    const b = pick(theirs);
    if (a === b) return a === 0 ? null : "tie";
    return a > b ? tr("You", "Ti") : partnerName;
  };
  const weekLeader = leader((t) => t.week);
  const maxWeek = Math.max(1, ...people.map((p) => p.t.week));
  const days = lastNDays(new Map(), PAIR_DAYS);
  const { top } = niceScale(Math.max(...mine.perDay, ...(theirs?.perDay ?? [0])));

  // The usual items on the shopping list, most bought first.
  const list = shoppingListOf(data.projects);
  const usual = Object.values(list?.bought ?? {})
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);
  const maxUsual = Math.max(1, ...usual.map((u) => u.n));

  return (
    <>
      <section className="stats-card us-card">
        <div className="stats-card-header">
          <h2>{tr("The two of you, last 7 days", "Vidva, zadnjih 7 dni")}</h2>
        </div>
        {!theirs && (
          <p className="stats-empty">
            {tr(
              `${partnerName}'s numbers show up here once their app has been opened after this update.`,
              `Številke za ${partnerName} se pokažejo, ko po tej posodobitvi enkrat odpre aplikacijo.`
            )}
          </p>
        )}
        {weekLeader && (
          <p className="us-leader">
            {weekLeader === "tie" ? (
              <>{tr("Neck and neck this week 🤝", "Ta teden sta izenačena 🤝")}</>
            ) : (
              <>
                👑 <b>{weekLeader}</b>{" "}
                {weekLeader === tr("You", "Ti")
                  ? tr("were the most active this week", "si bil(a) ta teden najbolj dejaven(-na)")
                  : tr("was the most active this week", "je bil(a) ta teden najbolj dejaven(-na)")}
              </>
            )}
          </p>
        )}
        <ul className="us-bars">
          {people.map((p) => (
            <li key={p.name} className={p.cls}>
              <span className="us-name">{p.name}</span>
              <span className="us-bar">
                <i style={{ width: `${(p.t.week / maxWeek) * 100}%` }} />
              </span>
              <span className="us-count">{p.t.week}</span>
            </li>
          ))}
        </ul>
        <table className="us-table">
          <thead>
            <tr>
              <th />
              {people.map((p) => (
                <th key={p.name} className={p.cls}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{tr("Today", "Danes")}</td>
              {people.map((p) => (
                <td key={p.name}>{p.t.today}</td>
              ))}
            </tr>
            <tr>
              <td>{tr("Last 7 days", "Zadnjih 7 dni")}</td>
              {people.map((p) => (
                <td key={p.name}>
                  {p.t.week}
                  <Change now={p.t.week} before={p.t.prevWeek} />
                </td>
              ))}
            </tr>
            <tr>
              <td>{tr("Last 30 days", "Zadnjih 30 dni")}</td>
              {people.map((p) => (
                <td key={p.name}>{p.t.month}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      {theirs && (
        <section className="stats-card">
          <div className="stats-card-header">
            <h2>{tr("Day by day", "Dan za dnem")}</h2>
            <span className="us-legend">
              <i className="is-me" /> {tr("You", "Ti")} <i className="is-partner" /> {partnerName}
            </span>
          </div>
          <div className="us-pairs" role="img" aria-label={tr(`Completed per day over the last ${PAIR_DAYS} days, you and ${partnerName}`, `Opravljeno na dan v zadnjih ${PAIR_DAYS} dneh, ti in ${partnerName}`)}>
            {days.map((d, i) => (
              <div
                key={d.key}
                className="us-pair"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setHovered(hovered === i ? null : i)}
              >
                <div className="us-pair-bars">
                  <i className="is-me" style={{ height: `${(mine.perDay[i] / top) * 100}%` }} />
                  <i className="is-partner" style={{ height: `${(theirs.perDay[i] / top) * 100}%` }} />
                </div>
                <span className="us-pair-day">{isToday(d.date) ? tr("Today", "Danes") : i % 2 === 1 ? format(d.date, "d") : ""}</span>
                {hovered === i && (
                  <div className={`col-chart-tooltip ${i > PAIR_DAYS - 4 ? "align-right" : ""}`}>
                    <strong>{format(d.date, tr("EEE d MMM", "EEE, d. MMM"))}</strong>
                    {tr("You", "Ti")} {mine.perDay[i]} · {partnerName} {theirs.perDay[i]}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="stats-card">
        <div className="stats-card-header">
          <h2>{tr("Shopping, last 30 days", "Nakupi, zadnjih 30 dni")}</h2>
        </div>
        <div className="us-shop-tiles">
          {people.map((p) => (
            <div key={p.name} className={`us-shop-tile ${p.cls}`}>
              <b>{p.name}</b>
              <span>
                <em>{p.t.bought}</em>{" "}
                {trn(p.t.bought, ["item bought", "items bought"], ["kupljen artikel", "kupljena artikla", "kupljeni artikli", "kupljenih artiklov"])}
              </span>
              <span>
                <em>{p.t.trips}</em>{" "}
                {trn(p.t.trips, ["trip to the shop", "trips to the shop"], ["obisk trgovine", "obiska trgovine", "obiski trgovine", "obiskov trgovine"])}
              </span>
            </div>
          ))}
        </div>
        {usual.length > 0 && (
          <>
            <h3 className="us-sub">{tr("Bought most often", "Najpogosteje kupljeno")}</h3>
            <ul className="us-usual">
              {usual.map((u) => (
                <li key={u.name}>
                  <span className="us-usual-name">{u.name}</span>
                  <span className="us-bar">
                    <i style={{ width: `${(u.n / maxUsual) * 100}%` }} />
                  </span>
                  <span className="us-count">{u.n}×</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function Change({ now, before }: { now: number; before: number }) {
  const d = now - before;
  if (d === 0) return null;
  return (
    <span className={`us-change ${d > 0 ? "up" : "down"}`} title={tr(`${before} the 7 days before`, `${before} v 7 dneh prej`)}>
      {d > 0 ? "▲" : "▼"}
      {Math.abs(d)}
    </span>
  );
}
