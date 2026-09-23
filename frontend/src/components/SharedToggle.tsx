import type { Partner } from "../api/types";
import { ShareIcon } from "./icons";

/** The "share with my partner" switch in quick add and the task details. */
export default function SharedToggle({
  partner,
  on,
  onChange,
  disabled,
}: {
  partner: Partner;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const first = partner.name.split(" ")[0];
  return (
    <button
      type="button"
      className={`field-pill shared-toggle ${on ? "is-on" : ""}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      title={on ? `Shared with ${first} (Midva)` : `Share with ${first}`}
    >
      <ShareIcon width={14} height={14} />
      {on ? `Midva · ${first}` : "Share"}
    </button>
  );
}
