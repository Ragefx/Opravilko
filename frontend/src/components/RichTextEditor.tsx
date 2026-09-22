import { useEffect, useRef } from "react";

/**
 * Minimal WYSIWYG editor for the task description -- bold and bulleted/
 * numbered lists, matching what Todoist's description field supports.
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

  function exec(command: string) {
    ref.current?.focus();
    document.execCommand(command);
    handleInput();
  }

  function handleInput() {
    const el = ref.current;
    if (!el) return;
    const next = el.innerHTML === "<br>" ? "" : el.innerHTML;
    lastExternalHtml.current = next;
    onChange(next);
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
      </div>
      <div className="rich-text-body-wrap">
        {isEmpty && <div className="rich-text-placeholder">{placeholder}</div>}
        <div
          ref={ref}
          className="rich-text-body"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={onBlur}
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
