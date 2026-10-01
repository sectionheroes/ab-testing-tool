/**
 * CodeField — the JavaScript and CSS editors of the experiment form (plan WP5a, ADR-0017).
 *
 * CodeMirror 6, the one UI dependency beyond DESIGN.md's stack (CLAUDE.md). It is loaded **dynamically, after mount**
 * for two reasons: it has no server rendering, and it is by far the biggest thing on the page — a form with four
 * editors should not block its own first paint on them.
 *
 * Until it has loaded, and whenever JavaScript is off, the same value sits in a plain `<textarea>` with the same
 * box. That is not a nicety: the textarea is also the field that gets submitted, so the form keeps working if
 * CodeMirror fails to load at all. CodeMirror writes through to it on every change.
 *
 * Figma draws the editor with line numbers, a slightly inset gutter and syntax colour. The colours come from the §2
 * tokens through `var(--color-…)`, not from one of CodeMirror's themes: a packaged theme would bring its own palette
 * and the two themes of DESIGN.md §3 would stop agreeing with the rest of the page. Those values go through `style`
 * and CSS variables, never through a class name, which is also what keeps `design-system.test.ts` green.
 */
import { useEffect, useRef, useState } from "react";

export type CodeLanguage = "javascript" | "css";

export function CodeField({
  name,
  label,
  defaultValue = "",
  language,
  readOnly = false,
  onChange,
  minHeight = 160,
  placeholder,
  className = "",
}: {
  /** Form field name — the hidden textarea carries it, so this works inside a plain `<Form method="post">`. */
  name: string;
  label?: string;
  defaultValue?: string;
  language: CodeLanguage;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  minHeight?: number;
  placeholder?: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [ready, setReady] = useState(false);
  // The callback changes on every render of the parent; keeping it in a ref means the editor is built once.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let view: { destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const [{ EditorState }, viewMod, { defaultKeymap, history, historyKeymap, indentWithTab }, { javascript }, { css }, lang] =
        await Promise.all([
          import("@codemirror/state"),
          import("@codemirror/view"),
          import("@codemirror/commands"),
          import("@codemirror/lang-javascript"),
          import("@codemirror/lang-css"),
          import("@codemirror/language"),
        ]);
      if (cancelled || !host.current) return;

      const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, placeholder: placeholderExt } = viewMod;
      const { syntaxHighlighting, HighlightStyle } = lang;
      const { tags } = await import("@lezer/highlight");

      // Tokens only. `--color-success` is the emerald accent of §2, `--color-info` the sky that WP5a introduced;
      // everything else is an opacity step on `base-content`, which is exactly what DESIGN.md §4 prescribes for grey.
      const highlight = HighlightStyle.define([
        { tag: [tags.comment], color: "color-mix(in oklab, var(--color-base-content) 40%, transparent)", fontStyle: "italic" },
        { tag: [tags.string, tags.special(tags.string)], color: "var(--color-success)" },
        { tag: [tags.keyword, tags.modifier, tags.controlKeyword], color: "var(--color-info)" },
        { tag: [tags.number, tags.bool, tags.null], color: "var(--color-warning)" },
        { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--color-base-content)" },
        { tag: [tags.propertyName, tags.attributeName], color: "color-mix(in oklab, var(--color-base-content) 80%, transparent)" },
        { tag: [tags.definitionKeyword, tags.typeName], color: "var(--color-info)" },
      ]);

      const theme = EditorView.theme({
        "&": { backgroundColor: "transparent", color: "var(--color-base-content)", fontSize: "13px", height: "100%" },
        "&.cm-focused": { outline: "none" },
        ".cm-content": { fontFamily: "var(--font-mono, ui-monospace, monospace)", padding: "10px 0" },
        ".cm-gutters": {
          backgroundColor: "transparent",
          border: "none",
          color: "color-mix(in oklab, var(--color-base-content) 30%, transparent)",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          paddingLeft: "10px",
          paddingRight: "4px",
        },
        ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--color-base-content) 4%, transparent)" },
        ".cm-activeLineGutter": { backgroundColor: "transparent", color: "color-mix(in oklab, var(--color-base-content) 55%, transparent)" },
        ".cm-cursor": { borderLeftColor: "var(--color-base-content)" },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
          backgroundColor: "color-mix(in oklab, var(--color-base-content) 18%, transparent)",
        },
        ".cm-placeholder": { color: "color-mix(in oklab, var(--color-base-content) 35%, transparent)" },
        // The editor grows with its content and never collapses below the box it sits in; `height: 100%` cannot do
        // that, because the host only carries a min-height.
        ".cm-scroller": { lineHeight: "1.55", overflow: "auto", minHeight: `${minHeight}px` },
      });

      const extensions = [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        language === "css" ? css() : javascript(),
        syntaxHighlighting(highlight),
        theme,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const value = update.state.doc.toString();
          // The textarea stays the field that is submitted; CodeMirror only writes through to it.
          if (textarea.current) textarea.current.value = value;
          onChangeRef.current?.(value);
        }),
      ];
      if (placeholder) extensions.push(placeholderExt(placeholder));

      const created = new EditorView({
        state: EditorState.create({ doc: textarea.current?.value ?? defaultValue, extensions }),
        parent: host.current,
      });
      view = created;
      setReady(true);
    })().catch(() => {
      // Nothing to do: the textarea underneath is a working editor, just without highlighting.
      setReady(false);
    });

    return () => {
      cancelled = true;
      view?.destroy();
      setReady(false);
    };
    // Rebuilding on a `defaultValue` change would throw away what the user has typed; the parent remounts the field
    // (via `key`) when it genuinely wants a different document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, placeholder, minHeight]);

  return (
    <div className={className}>
      {label && <span className="mb-1.5 block text-sm text-base-content/60">{label}</span>}
      <div className="overflow-hidden rounded-lg border border-border-strong bg-base-100 focus-within:border-base-content/50">
        <div ref={host} className={ready ? "block" : "hidden"} />
        <textarea
          ref={textarea}
          name={name}
          defaultValue={defaultValue}
          readOnly={readOnly}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onChangeRef.current?.(e.currentTarget.value)}
          // `hidden` rather than a visually-hidden class: a `display:none` form control is still submitted, and an
          // off-screen full-width textarea made the page scroll sideways, which DESIGN.md §10 forbids outright.
          className={
            ready
              ? "hidden"
              : "block w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[13px] leading-relaxed text-base-content outline-none placeholder:text-base-content/35"
          }
          style={ready ? undefined : { minHeight }}
          aria-label={label}
          aria-hidden={ready}
          tabIndex={ready ? -1 : undefined}
        />
      </div>
    </div>
  );
}
