import { tr } from "../i18n";
import { REPEAT_PRESETS, type RepeatPreset } from "../utils/recurrence";
import Select from "./Select";

/**
 * The "Doesn't repeat / Every day / ..." dropdown. A repeat typed some other
 * way ("every 3 days") shows as its own entry, labelled `customLabel`.
 */
export default function RepeatSelect({
  value,
  onChange,
  customLabel,
}: {
  value: RepeatPreset | "none" | "custom";
  onChange: (next: RepeatPreset | "none") => void;
  customLabel?: string;
}) {
  return (
    <Select
      className="detail-date-input"
      value={value}
      onChange={(e) => onChange(e.target.value as RepeatPreset | "none")}
      aria-label={tr("Repeat", "Ponavljanje")}
    >
      <option value="none">{tr("Doesn't repeat", "Se ne ponavlja")}</option>
      {value === "custom" && <option value="custom">{customLabel || tr("Custom", "Po meri")}</option>}
      {REPEAT_PRESETS.map((p) => (
        <option key={p.key} value={p.key}>
          {p.label}
        </option>
      ))}
    </Select>
  );
}
