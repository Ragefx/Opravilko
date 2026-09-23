import { useEffect, useState } from "react";
import type { Task } from "../api/types";
import { stripHtml } from "../utils/html";

const LENGTHS = [15, 25, 50];

/**
 * A distraction-free screen for one task with a countdown (25 minutes by
 * default). Nothing is saved about the session; finishing just completes the
 * task.
 */
export default function FocusMode({
  task,
  projectName,
  onDone,
  onClose,
}: {
  task: Task;
  projectName?: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(25);
  const [endsAt, setEndsAt] = useState<number | null>(() => Date.now() + 25 * 60_000);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.max(0, pausedLeft ?? (endsAt ? endsAt - now : 0));
  const finished = endsAt !== null && pausedLeft === null && left === 0;
  const mm = String(Math.floor(left / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  const progress = 1 - left / (minutes * 60_000);

  useEffect(() => {
    document.title = finished ? "Time's up · Opravilko" : `${mm}:${ss} · ${task.content}`;
    return () => {
      document.title = "Opravilko";
    };
  }, [mm, ss, finished, task.content]);

  function restart(m: number) {
    setMinutes(m);
    setPausedLeft(null);
    setEndsAt(Date.now() + m * 60_000);
  }

  function togglePause() {
    if (pausedLeft !== null) {
      setEndsAt(Date.now() + pausedLeft);
      setPausedLeft(null);
    } else {
      setPausedLeft(left);
    }
  }

  const description = task.description ? stripHtml(task.description) : "";

  return (
    <div className="focus-mode" role="dialog" aria-label="Focus">
      <div className="focus-mode-inner">
        <span className="focus-mode-project">{projectName}</span>
        <h2 className="focus-mode-title">{task.content}</h2>
        {description && <p className="focus-mode-desc">{description}</p>}
        <div className="focus-mode-timer" aria-live="polite">
          {finished ? "Time's up" : `${mm}:${ss}`}
        </div>
        <div className="focus-mode-bar">
          <i style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
        <div className="focus-mode-lengths">
          {LENGTHS.map((m) => (
            <button key={m} className={m === minutes ? "active" : ""} onClick={() => restart(m)}>
              {m} min
            </button>
          ))}
        </div>
        <div className="focus-mode-actions">
          <button className="btn btn-text" onClick={onClose}>
            Stop
          </button>
          {!finished && (
            <button className="btn btn-text" onClick={togglePause}>
              {pausedLeft !== null ? "Resume" : "Pause"}
            </button>
          )}
          <button className="btn btn-primary" onClick={onDone}>
            Mark done
          </button>
        </div>
      </div>
    </div>
  );
}
