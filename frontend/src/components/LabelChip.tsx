import type { CSSProperties } from "react";
import { useBootstrap } from "../api/hooks";
import { colorHex } from "../utils/colors";

/** name -> the label's colour (grey for a name without a label record). */
export function useLabelColor(): (name: string) => string {
  const labels = useBootstrap().data?.labels;
  return (name) => colorHex(labels?.find((l) => l.name.toLowerCase() === name.toLowerCase())?.color);
}

/** Inline style for a chip tinted with a label's colour (see .label-tint in the CSS). */
export const labelTint = (hex: string) => ({ "--label-color": hex }) as CSSProperties;

/** "@name" as a small chip in the label's colour. */
export default function LabelChip({ name }: { name: string }) {
  const colorOf = useLabelColor();
  return (
    <span className="chip label-chip label-tint" style={labelTint(colorOf(name))}>
      @{name}
    </span>
  );
}
