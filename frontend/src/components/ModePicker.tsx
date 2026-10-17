import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { tr } from "../i18n";
import type { AppData } from "../api/types";
import { MODES, setMode, suggestedMode, useMode, type Mode } from "../utils/mode";

/** Bebek or Bebika, as two cards; picking one sets this device's switches. */
export default function ModePicker({ onPicked }: { onPicked?: (mode: Mode) => void }) {
  const mode = useMode();
  const queryClient = useQueryClient();
  function pick(m: Mode) {
    setMode(m);
    // The calendars (and the phone's widget) redraw with or without completed tasks.
    queryClient.setQueryData<AppData>(["bootstrap"], (d) => (d ? { ...d } : d));
    onPicked?.(m);
  }
  return (
    <div className="look-options mode-options" role="radiogroup" aria-label={tr("Mode", "Način")}>
      {MODES.map((m) => (
        <button key={m.id} role="radio" aria-checked={mode === m.id} className={`look-option ${mode === m.id ? "is-selected" : ""}`} onClick={() => pick(m.id)}>
          <span className="mode-emoji" aria-hidden="true">
            {m.id === "bebek" ? "🧸" : "🌸"}
          </span>
          <span className="look-option-text">
            <b>{m.name}</b>
            <span>{m.blurb}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Asked once on each device: which mode to start from. */
export function ModeQuestion({ onDone }: { onDone: () => void }) {
  const suggested = suggestedMode();
  return createPortal(
    <div className="modal-backdrop" onClick={() => (setMode(suggested), onDone())}>
      <div className="modal mode-question" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr("Bebek or Bebika?", "Bebek ali Bebika?")}>
        <h3>{tr("Bebek or Bebika?", "Bebek ali Bebika?")}</h3>
        <p className="settings-hint">
          {tr(
            "How much should the app show on this device? You can change it, or any single switch, in Settings > What's shown.",
            "Koliko naj aplikacija kaže na tej napravi? Spremeniš lahko v Nastavitve > Kaj je prikazano, tudi vsako stikalo posebej."
          )}
        </p>
        <ModePicker onPicked={onDone} />
      </div>
    </div>,
    document.body
  );
}
