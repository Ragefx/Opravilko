import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "./icons";

export interface PickOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /** A small number at the end of the row (e.g. how many items). */
  count?: number;
  disabled?: boolean;
}

/**
 * A choice from a list, in the app's own look: a sheet from the bottom on a
 * phone, a small window on a wide screen; the current choice ticked. Used
 * instead of Android's plain list for every dropdown in the app.
 */
export default function PickSheet({
  title,
  subtitle,
  options,
  current,
  onPick,
  onClose,
  footer,
}: {
  title?: string;
  subtitle?: string;
  options: PickOption[];
  current: string;
  onPick: (value: string) => void;
  onClose: () => void;
  /** Something after the choices (e.g. adding a new one). */
  footer?: ReactNode;
}) {
  return createPortal(
    <div
      className="modal-backdrop shop-picker-backdrop over-modal"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="shop-picker" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title ?? "Choose"}>
        <div className="shop-picker-handle" aria-hidden="true" />
        {title && <h3>{title}</h3>}
        {subtitle && <p>{subtitle}</p>}
        <div className="shop-picker-list" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={current === o.value}
              disabled={o.disabled}
              className={`shop-picker-row ${current === o.value ? "is-current" : ""}`}
              onClick={() => onPick(o.value)}
            >
              {o.icon !== undefined && (
                <span className="shop-picker-icon" aria-hidden="true">
                  {o.icon}
                </span>
              )}
              <span className="shop-picker-name">{o.label}</span>
              {o.count ? <span className="shop-picker-count">{o.count}</span> : null}
              <span className="shop-picker-check" aria-hidden="true">
                {current === o.value && <CheckIcon width={18} height={18} />}
              </span>
            </button>
          ))}
          {footer}
        </div>
      </div>
    </div>,
    document.body
  );
}
