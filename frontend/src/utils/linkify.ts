const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]|(?<![@/\w])www\.[^\s<>"']+[^\s<>"'.,;:!?)]/gi;

/**
 * Wraps bare URLs in a rich-text description's HTML with <a> tags, so a
 * pasted/typed link becomes clickable without the user having to select it
 * and use the toolbar's Link button. Only walks text nodes, so it never
 * touches text that's already inside an <a> (or any other tag/attribute).
 */
export function linkifyHtml(html: string): string {
  if (!html || !html.includes(".")) return html; // cheap bail-out, no dot => no URL possible
  const root = document.createElement("div");
  root.innerHTML = html;

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      return parent && parent.closest("a") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n as Text);

  for (const node of textNodes) {
    const text = node.textContent || "";
    URL_RE.lastIndex = 0;
    if (!URL_RE.test(text)) continue;
    URL_RE.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const url = m[0];
      const a = document.createElement("a");
      a.href = url.startsWith("http") ? url : `https://${url}`;
      a.textContent = url;
      frag.appendChild(a);
      last = m.index + url.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  }

  return root.innerHTML;
}
