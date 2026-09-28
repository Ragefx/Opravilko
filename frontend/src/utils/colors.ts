// Todoist-style named color palette.
export const COLORS: Record<string, string> = {
  red: "#e44332",
  orange: "#ff9a14",
  yellow: "#fad000",
  olive: "#afb83b",
  lime: "#7ecc49",
  green: "#299438",
  mint: "#6accbc",
  teal: "#158fad",
  sky: "#14aaf5",
  blue: "#96c3eb",
  grape: "#4073ff",
  violet: "#884dff",
  lavender: "#af38eb",
  magenta: "#eb96eb",
  salmon: "#e05194",
  charcoal: "#808080",
  grey: "#b8b8b8",
  taupe: "#ccac93",
};

export const COLOR_NAMES = Object.keys(COLORS);

export function colorHex(name: string | undefined): string {
  return (name && COLORS[name]) || COLORS.grey;
}

/** Labels get these in turn, so each one looks different (grey is left out). */
const LABEL_PALETTE = [
  "red", "grape", "green", "orange", "violet", "teal", "salmon", "lime",
  "sky", "lavender", "olive", "taupe", "mint", "magenta", "blue", "yellow",
];

/** The palette colour the fewest labels already use (earliest one on a tie). */
export function pickLabelColor(taken: string[]): string {
  const uses = (c: string) => taken.filter((t) => t === c).length;
  return LABEL_PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best), LABEL_PALETTE[0]);
}

/** The colours labels used to get by default: these are recoloured once. */
export const PLAIN_LABEL_COLORS = ["grey", "charcoal"];
