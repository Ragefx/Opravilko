import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { MoreIcon } from "./icons";

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

/**
 * The "⋯" overflow menu shown on hover for sidebar rows. The panel is portalled
 * to <body> with fixed positioning because the sidebar scrolls, and an absolutely
 * positioned child would be clipped by its overflow.
 */
export default function RowMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (anchor) {
      setAnchor(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  return (
    <span className="row-menu">
      <button ref={triggerRef} className="row-menu-trigger" aria-label={`${label} options`} onClick={toggle}>
        <MoreIcon width={18} height={18} />
      </button>
      {anchor &&
        createPortal(
          <>
            <div
              className="dropdown-backdrop"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setAnchor(null);
              }}
            />
            <div
              className="dropdown-panel row-menu-panel"
              style={{ top: anchor.top, right: anchor.right }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  className={`row-menu-item ${item.danger ? "danger" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAnchor(null);
                    item.onClick();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </span>
  );
}
