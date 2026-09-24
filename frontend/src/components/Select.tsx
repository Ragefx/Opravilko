import { Children, isValidElement, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { appUi } from "../utils/appUi";
import PickSheet, { type PickOption } from "./PickSheet";
import { ChevronIcon } from "./icons";

/** The text of an <option>'s children ("Work", or {name}{" (shopping list)"}). */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/**
 * A <select> that, in the Android app, opens the app's own sheet instead of
 * Android's plain list; on the website it's the browser's usual dropdown.
 * Takes <option> children and an onChange reading `e.target.value`, as a
 * select does. `sheetTitle` (or aria-label) heads the sheet.
 */
export default function Select({
  sheetTitle,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { sheetTitle?: string }) {
  const [open, setOpen] = useState(false);
  if (!appUi) return <select {...props}>{children}</select>;

  const options: PickOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return;
    const value = String(child.props.value ?? textOf(child.props.children));
    options.push({ value, label: textOf(child.props.children) || " ", disabled: child.props.disabled });
  });
  const value = String(props.value ?? "");
  const current = options.find((o) => o.value === value);
  const title = sheetTitle ?? props["aria-label"];

  function pick(next: string) {
    setOpen(false);
    if (next === value) return;
    // Handlers read e.target.value, as from a real select.
    const target = { value: next };
    props.onChange?.({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>);
  }

  return (
    <>
      <button
        type="button"
        className={`app-select ${props.className ?? ""}`}
        style={props.style}
        disabled={props.disabled}
        aria-label={props["aria-label"]}
        aria-haspopup="listbox"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <span className="app-select-value">{current?.label.trim() || " "}</span>
        <ChevronIcon width={14} height={14} className="app-select-chevron" />
      </button>
      {open && <PickSheet title={title} options={options} current={value} onPick={pick} onClose={() => setOpen(false)} />}
    </>
  );
}
