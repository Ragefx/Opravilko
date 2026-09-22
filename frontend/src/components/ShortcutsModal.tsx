const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "q", label: "Add a task from anywhere" },
  { keys: "/", label: "Search" },
  { keys: "⌘K / Ctrl+K", label: "Search" },
  { keys: "g then t", label: "Go to Today" },
  { keys: "g then u", label: "Go to Upcoming" },
  { keys: "g then i", label: "Go to Inbox" },
  { keys: "g then c", label: "Go to Completed" },
  { keys: "?", label: "Show this list" },
  { keys: "Esc", label: "Close whatever is open" },
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard shortcuts</h3>
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
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
