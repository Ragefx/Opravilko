import { useState } from "react";
import { format, isToday } from "date-fns";
import { useBootstrap } from "../api/hooks";
import { colorHex } from "../utils/colors";
import { allCompletions, countByDay, currentStreak, lastNDays, longestStreak, niceScale } from "../utils/stats";

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
          <h1>Productivity</h1>
          <div className="page-subtitle">What you've been getting done</div>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="stat-label">Current streak</div>
          <div className="stat-value">
            {streak} {streak === 1 ? "day" : "days"}
          </div>
          <div className="stat-note">Best: {best} {best === 1 ? "day" : "days"}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Completed today</div>
          <div className="stat-value">{today}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Last 7 days</div>
          <div className="stat-value">{last7}</div>
          <div className={`stat-note ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
            {delta === 0 ? "Same as" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs`} previous 7 days
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">All time</div>
          <div className="stat-value">{entries.length.toLocaleString()}</div>
        </div>
      </div>

      <section className="stats-card">
        <div className="stats-card-header">
          <h2>Completed per day</h2>
          <button className="btn-text stats-table-toggle" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Show chart" : "Show as table"}
          </button>
        </div>

        {showTable ? (
          <table className="stats-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.key}>
                  <td>{format(d.date, "EEE d MMM")}</td>
                  <td>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="col-chart" role="img" aria-label={`Tasks completed per day over the last ${CHART_DAYS} days`}>
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
                      <strong>{format(d.date, "EEE d MMM")}</strong>
                      {d.count} {d.count === 1 ? "task" : "tasks"} completed
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="col-chart-xaxis">
              {days.map((d, i) => (
                <span key={d.key}>{isToday(d.date) ? "Today" : i % 2 === 1 ? format(d.date, "d") : ""}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="stats-card">
        <div className="stats-card-header">
          <h2>By project, last 7 days</h2>
        </div>
        {projectRows.length === 0 ? (
          <p className="stats-empty">Nothing completed in the last 7 days yet.</p>
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
