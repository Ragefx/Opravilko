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
