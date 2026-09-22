/** Plain-text preview of a (possibly rich-text) task description, for card/list previews. */
export function stripHtml(html: string): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}
