import Select from "./Select";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * A time as "HH:mm", always in 24 hours (a browser's own time field follows
 * the computer's AM/PM setting). Hour and minute pickers; with `optional`,
 * the hour can be left empty for no time at all.
 */
export default function TimeInput({
  value,
  onChange,
  optional = false,
  idPrefix,
  label = "Time",
}: {
  value: string;
  onChange: (next: string) => void;
  optional?: boolean;
  idPrefix?: string;
  label?: string;
}) {
  const [h, m] = value ? value.split(":") : ["", ""];
  // A minute that isn't on the 5-minute steps (typed elsewhere) stays pickable.
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES;
  return (
    <span className="time-input">
      <Select
        id={idPrefix ? `${idPrefix}-h` : undefined}
        value={h}
        aria-label={`${label}: hour`}
        sheetTitle="Hour"
        onChange={(e) => {
          const hour = e.target.value;
          onChange(hour ? `${hour}:${m || "00"}` : "");
        }}
      >
        {optional && <option value="">--</option>}
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </Select>
      <b aria-hidden="true">:</b>
      <Select
        id={idPrefix ? `${idPrefix}-m` : undefined}
        value={m}
        disabled={!h}
        aria-label={`${label}: minute`}
        sheetTitle="Minute"
        onChange={(e) => onChange(`${h || "00"}:${e.target.value}`)}
      >
        {!h && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </Select>
    </span>
  );
}
