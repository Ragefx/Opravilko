import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBootstrap } from "../api/hooks";
import { colorHex } from "../utils/colors";
import { FilterIcon, HashIcon, LabelIcon } from "./icons";

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const { data } = useBootstrap();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!data) return { tasks: [], projects: [], labels: [], filters: [] };
    const q = query.trim().toLowerCase();
    if (!q) return { tasks: [], projects: [], labels: [], filters: [] };
    return {
      tasks: data.tasks.filter((t) => !t.completed && t.content.toLowerCase().includes(q)).slice(0, 8),
      projects: data.projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5),
      labels: data.labels.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 5),
      filters: data.filters.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 5),
    };
  }, [data, query]);

  const hasResults =
    results.tasks.length + results.projects.length + results.labels.length + results.filters.length > 0;

  function goToTask(taskId: string, projectId: string) {
    navigate(`/app/project/${projectId}?open=${taskId}`);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="text"
          placeholder="Search tasks, projects, labels, filters..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />

        {query.trim() && !hasResults && (
          <div className="empty-state" style={{ padding: "24px 0" }}>
            No matches for "{query}"
          </div>
        )}

        {results.tasks.length > 0 && (
          <div className="search-group">
            <div className="search-group-title">Tasks</div>
            {results.tasks.map((t) => (
              <button key={t.id} className="search-result" onClick={() => goToTask(t.id, t.projectId)}>
                {t.content}
              </button>
            ))}
          </div>
        )}

        {results.projects.length > 0 && (
          <div className="search-group">
            <div className="search-group-title">Projects</div>
            {results.projects.map((p) => (
              <button
                key={p.id}
                className="search-result"
                onClick={() => {
                  navigate(`/app/project/${p.id}`);
                  onClose();
                }}
              >
                <HashIcon width={14} height={14} style={{ color: colorHex(p.color) }} /> {p.name}
              </button>
            ))}
          </div>
        )}

        {results.labels.length > 0 && (
          <div className="search-group">
            <div className="search-group-title">Labels</div>
            {results.labels.map((l) => (
              <button
                key={l.id}
                className="search-result"
                onClick={() => {
                  navigate(`/app/label/${encodeURIComponent(l.name)}`);
                  onClose();
                }}
              >
                <LabelIcon width={14} height={14} style={{ color: colorHex(l.color) }} /> {l.name}
              </button>
            ))}
          </div>
        )}

        {results.filters.length > 0 && (
          <div className="search-group">
            <div className="search-group-title">Filters</div>
            {results.filters.map((f) => (
              <button
                key={f.id}
                className="search-result"
                onClick={() => {
                  navigate(`/app/filter/${f.id}`);
                  onClose();
                }}
              >
                <FilterIcon width={14} height={14} style={{ color: colorHex(f.color) }} /> {f.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
