import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LinkIcon } from "./icons";
import { linkifyHtml } from "../utils/linkify";
import { appUi } from "../utils/appUi";

/**
 * The task description: a small WYSIWYG editor, stored as a small HTML subset
 * (task.description). Plain-text descriptions still render fine: a
 * contentEditable div with no tags in it is just text.
 *
 * No toolbar: on the website, selecting text shows a small dark bar above it
 * (bold, italic, strikethrough, headings, quote, code, lists, link), as in
 * Todoist; Ctrl+B / Ctrl+I work too. The Android app keeps it plain.
 */
export default function RichTextEditor({
  html,
  onChange,
  onBlur,
  placeholder = "Description",
}: {
  html: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Only push `html` into the DOM when it changed from outside (e.g. switching
  // tasks) -- never on every render, or the cursor jumps to the start on each
  // keystroke since we're also the ones calling onChange from input events.
  const lastExternalHtml = useRef<string | null>(null);
  // Whether the editor already had focus *before* this click, captured on
  // mousedown (which is what actually moves focus) so the click handler can
  // tell "just clicking a link to open it" apart from "clicking a link while
  // already editing, to place the caret in it".
  const hadFocusBeforeClick = useRef(false);
  // Where the selection bar sits (website only), or null when nothing's selected.
  const [bar, setBar] = useState<{ top: number; left: number } | null>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    if (appUi) return;
    function onSelection() {
      const el = ref.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.isCollapsed || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
        setBar(null);
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r.width && !r.height) return setBar(null);
      const width = 400;
      setBar({
        top: r.top - 48 < 8 ? r.bottom + 8 : r.top - 48,
        left: Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8)),
      });
      redraw((n) => n + 1); // which buttons are on follows the selection
    }
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (html !== lastExternalHtml.current && html !== el.innerHTML) {
      el.innerHTML = html;
    }
    lastExternalHtml.current = html;
  }, [html]);

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  }

  function handleInput() {
    const el = ref.current;
    if (!el) return;
    const next = el.innerHTML === "<br>" ? "" : el.innerHTML;
    lastExternalHtml.current = next;
    onChange(next);
  }

  function handleAddLink() {
    const url = window.prompt("Link URL");
    if (!url) return;
    const el = ref.current;
    el?.focus();
    const selection = window.getSelection();
    // No text selected -- insert the URL itself as the link's visible text,
    // rather than createLink silently doing nothing on a collapsed selection.
    if (!selection || selection.isCollapsed) {
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
      handleInput();
      return;
    }
    exec("createLink", url);
  }

  /** Headings and quotes switch a block on, and off again when it already is one. */
  function toggleBlock(tag: "h1" | "h2" | "blockquote") {
    const current = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
    exec("formatBlock", current === tag ? "div" : tag);
  }

  /** Inline code: the selection in <code>, or out of it again. */
  function toggleCode() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const inCode = (sel.anchorNode?.parentElement as HTMLElement | null)?.closest("code");
    if (inCode && ref.current?.contains(inCode)) {
      inCode.replaceWith(document.createTextNode(inCode.textContent ?? ""));
      handleInput();
      return;
    }
    exec("insertHTML", `<code>${escapeHtml(sel.toString())}</code>`);
  }

  const on = (command: string) => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };
  const block = () => String(document.queryCommandValue("formatBlock") || "").toLowerCase();

  function handleBlur() {
    const el = ref.current;
    if (el) {
      const linked = linkifyHtml(el.innerHTML);
      if (linked !== el.innerHTML) {
        el.innerHTML = linked;
        handleInput();
      }
    }
    onBlur?.();
  }

  const isEmpty = !html || html === "<br>";

  return (
    <div className="rich-text-editor">
      <div className="rich-text-body-wrap">
        {isEmpty && <div className="rich-text-placeholder">{placeholder}</div>}
        <div
          ref={ref}
          className="rich-text-body"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onMouseDown={() => {
            hadFocusBeforeClick.current = document.activeElement === ref.current;
          }}
          onMouseUp={(e) => {
            // Chromium doesn't fire a `click` event for the first click that
            // both focuses an unfocused contentEditable *and* lands on a link
            // inside it -- it's consumed for entering edit mode instead. Using
            // mouseup (which always fires) avoids that first-click miss.
            const link = (e.target as HTMLElement).closest("a");
            if (!link) return;
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) return; // was a text-selection drag, not a click
            // A plain click opens it, like anywhere else on the web -- unless
            // you were already editing (had focus before this interaction),
            // in which case it just places the caret so link text can still
            // be fixed; Ctrl/Cmd+click always opens it regardless.
            if (!hadFocusBeforeClick.current || e.metaKey || e.ctrlKey) {
              window.open(link.href, "_blank", "noopener,noreferrer");
            }
          }}
          onKeyDown={(e) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const key = e.key.toLowerCase();
            if (key === "b" || key === "i") {
              e.preventDefault();
              exec(key === "b" ? "bold" : "italic");
            }
          }}
        />
      </div>
      {bar &&
        createPortal(
          <div
            className="rt-bar"
            style={{ top: bar.top, left: bar.left }}
            // Clicking the bar mustn't lose the selection it acts on.
            onMouseDown={(e) => e.preventDefault()}
            role="toolbar"
            aria-label="Format"
          >
            <BarButton title="Bold (Ctrl+B)" active={on("bold")} onClick={() => exec("bold")}>
              <b>B</b>
            </BarButton>
            <BarButton title="Italic (Ctrl+I)" active={on("italic")} onClick={() => exec("italic")}>
              <i style={{ fontFamily: "Georgia, serif" }}>I</i>
            </BarButton>
            <BarButton title="Strikethrough" active={on("strikeThrough")} onClick={() => exec("strikeThrough")}>
              <s>S</s>
            </BarButton>
            <BarButton title="Heading 1" active={block() === "h1"} onClick={() => toggleBlock("h1")}>
              H<sub>1</sub>
            </BarButton>
            <BarButton title="Heading 2" active={block() === "h2"} onClick={() => toggleBlock("h2")}>
              H<sub>2</sub>
            </BarButton>
            <BarButton title="Quote" active={block() === "blockquote"} onClick={() => toggleBlock("blockquote")}>
              <QuoteIcon />
            </BarButton>
            <BarButton title="Code" onClick={toggleCode}>
              <CodeIcon />
            </BarButton>
            <BarButton title="Bulleted list" active={on("insertUnorderedList")} onClick={() => exec("insertUnorderedList")}>
              <BulletsIcon />
            </BarButton>
            <BarButton title="Numbered list" active={on("insertOrderedList")} onClick={() => exec("insertOrderedList")}>
              <NumbersIcon />
            </BarButton>
            <span className="rt-bar-sep" aria-hidden="true" />
            <button type="button" className="rt-bar-btn rt-bar-link" title="Add link" onClick={handleAddLink}>
              <LinkIcon width={15} height={15} /> Link
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

function BarButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`rt-bar-btn ${active ? "is-on" : ""}`} title={title} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

const QuoteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 17h5l2-4V7H5v6h3l-2 4zm10 0h5l2-4V7h-6v6h3l-2 4z" />
  </svg>
);
const CodeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
  </svg>
);
const BulletsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.2" fill="currentColor" />
    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="4.5" cy="18" r="1.2" fill="currentColor" />
  </svg>
);
const NumbersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 5l1.5-1v5M3.5 13.5c.4-1 2.5-1 2.5.3 0 1-2.5 2-2.5 2.7H6M3.6 17.3c.6-.6 2.4-.5 2.4.5s-1 1-1.6 1c.8 0 1.8.2 1.6 1.2-.2 1-2 1-2.5.3" strokeWidth="1.3" />
  </svg>
);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
