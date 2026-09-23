import { REPEAT_PRESETS, type RepeatPreset } from "../utils/recurrence";

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
    <select
      className="detail-date-input"
      value={value}
      onChange={(e) => onChange(e.target.value as RepeatPreset | "none")}
      aria-label="Repeat"
    >
      <option value="none">Doesn't repeat</option>
      {value === "custom" && <option value="custom">{customLabel || "Custom"}</option>}
      {REPEAT_PRESETS.map((p) => (
        <option key={p.key} value={p.key}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
