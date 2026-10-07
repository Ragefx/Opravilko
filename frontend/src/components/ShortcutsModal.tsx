import { tr } from "../i18n";
const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "q", label: tr("Add a task from anywhere", "Dodaj nalogo od koder koli") },
  { keys: "/", label: tr("Search", "Iskanje") },
  { keys: "⌘K / Ctrl+K", label: tr("Search", "Iskanje") },
  { keys: tr("g then t", "g nato t"), label: tr("Go to Today", "Pojdi na Danes") },
  { keys: tr("g then u", "g nato u"), label: tr("Go to Upcoming", "Pojdi na Prihajajoče") },
  { keys: tr("g then i", "g nato i"), label: tr("Go to Inbox", "Pojdi na Prejeto") },
  { keys: tr("g then c", "g nato c"), label: tr("Go to Completed", "Pojdi na Opravljeno") },
  { keys: "?", label: tr("Show this list", "Pokaži ta seznam") },
  { keys: "Esc", label: tr("Close whatever is open", "Zapri, kar je odprto") },
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tr("Keyboard shortcuts", "Bližnjice na tipkovnici")}</h3>
        <div className="shortcut-list">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="shortcut-row">
              <span>{s.label}</span>
              <kbd>{s.keys}</kbd>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            {tr("Got it", "Razumem")}
          </button>
        </div>
      </div>
    </div>
  );
}
