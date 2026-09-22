import { useEffect, useRef } from "react";
import { LinkIcon } from "./icons";
import { linkifyHtml } from "../utils/linkify";

/**
 * Minimal WYSIWYG editor for the task description -- bold, bulleted/numbered
 * lists, and links, matching what Todoist's description field supports.
 * Stores its content as a small HTML subset (task.description). Plain-text
 * descriptions written before this existed still render fine: a contentEditable
 * div with no tags in it is just text.
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
      <div className="rich-text-toolbar">
        <button
          type="button"
          className="rich-text-btn"
          title="Bold (Ctrl+B)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="rich-text-btn"
          title="Bulleted list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
        >
          •≡
        </button>
        <button
          type="button"
          className="rich-text-btn"
          title="Numbered list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertOrderedList")}
        >
          1≡
        </button>
        <button
          type="button"
          className="rich-text-btn"
          title="Add link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAddLink}
        >
          <LinkIcon width={13} height={13} />
        </button>
      </div>
      <div className="rich-text-body-wrap">
        {isEmpty && <div className="rich-text-placeholder">{placeholder}</div>}
        <div
          ref={ref}
          className="rich-text-body"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onClick={(e) => {
            const link = (e.target as HTMLElement).closest("a");
            // Plain clicks just move the caret, like any other text -- only
            // Ctrl/Cmd+click opens it, so editing a link's text doesn't fight
            // with following it.
            if (link && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              window.open(link.href, "_blank", "noopener,noreferrer");
            }
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
              e.preventDefault();
              exec("bold");
            }
          }}
        />
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
