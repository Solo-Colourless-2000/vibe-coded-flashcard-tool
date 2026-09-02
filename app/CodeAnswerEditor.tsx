"use client";

import { indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  Compartment,
  EditorState,
  Prec,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as editorPlaceholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { Expand, Minimize2, WrapText } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type CodeLanguage =
  | "plain"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "python"
  | "html"
  | "css"
  | "json"
  | "sql"
  | "java";

export const CODE_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: CodeLanguage;
  label: string;
}> = [
  { value: "plain", label: "プレーンテキスト" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "python", label: "Python" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "sql", label: "SQL" },
  { value: "java", label: "Java" },
];

export type CodeAnswerEditorHandle = {
  focus: () => void;
};

type CodeAnswerEditorProps = {
  ariaLabelledBy: string;
  describedBy?: string;
  disabled?: boolean;
  id: string;
  language: CodeLanguage;
  maxLength: number;
  onChange: (value: string) => void;
  onLanguageChange: (language: CodeLanguage) => void;
  onSubmitShortcut: () => void;
  placeholder: string;
  value: string;
};

type EditorStatus = {
  characters: number;
  column: number;
  line: number;
  lines: number;
};

const CODE_INDENT_SIZE = 4;
const CODE_INDENT_UNIT = " ".repeat(CODE_INDENT_SIZE);

const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--panel-soft)",
      color: "var(--text)",
      fontSize: "14px",
      minHeight: "260px",
    },
    "&.cm-focused": {
      outline: "2px solid var(--accent)",
      outlineOffset: "-2px",
    },
    ".cm-scroller": {
      fontFamily:
        '"SFMono-Regular", Consolas, "Liberation Mono", "Noto Sans Mono", monospace',
      lineHeight: "1.62",
      minHeight: "260px",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      minHeight: "260px",
      padding: "14px 0 32px",
    },
    ".cm-line": {
      padding: "0 18px 0 10px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--accent)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--panel)",
      borderRight: "1px solid var(--line)",
      color: "var(--muted)",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "rgba(213, 255, 99, 0.055)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
      {
        backgroundColor: "rgba(113, 150, 41, 0.42)",
      },
    ".cm-placeholder": {
      color: "var(--muted)",
      fontStyle: "normal",
    },
    ".cm-panels": {
      backgroundColor: "var(--panel)",
      color: "var(--text)",
    },
    ".cm-panel.cm-search": {
      boxSizing: "border-box",
      width: "100%",
      maxWidth: "100%",
      padding: "8px 34px 8px 8px",
      borderTop: "1px solid var(--line)",
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "6px",
      overflow: "hidden",
      lineHeight: "1.35",
    },
    ".cm-panel.cm-search > input, .cm-panel.cm-search > button, .cm-panel.cm-search > label":
      {
        margin: "0",
      },
    ".cm-panel.cm-search > .cm-textfield": {
      flex: "1 1 180px",
      width: "auto",
      minWidth: "120px",
      maxWidth: "100%",
      minHeight: "32px",
      height: "32px",
      padding: "4px 8px",
      border: "1px solid var(--line-strong)",
      borderRadius: "0",
      backgroundColor: "var(--panel-soft)",
      color: "var(--text)",
      fontSize: "12px",
    },
    ".cm-panel.cm-search > .cm-button": {
      flex: "0 0 auto",
      minHeight: "30px",
      padding: "4px 9px",
      border: "1px solid var(--line-strong)",
      borderRadius: "0",
      backgroundColor: "var(--panel-raised)",
      backgroundImage: "none",
      color: "var(--muted-strong)",
      cursor: "pointer",
      fontSize: "11px",
      lineHeight: "1.2",
    },
    ".cm-panel.cm-search > .cm-button:hover": {
      borderColor: "var(--muted)",
      color: "var(--text)",
    },
    ".cm-panel.cm-search > label": {
      flex: "0 0 auto",
      maxWidth: "100%",
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      color: "var(--muted-strong)",
      fontSize: "11px",
      lineHeight: "1.4",
      whiteSpace: "nowrap",
    },
    ".cm-panel.cm-search input[type=checkbox]": {
      flex: "0 0 14px",
      width: "14px",
      height: "14px",
      minHeight: "0",
      margin: "0",
      padding: "0",
      accentColor: "var(--accent)",
    },
    ".cm-panel.cm-search > br": {
      display: "block",
      flexBasis: "100%",
      width: "0",
      height: "0",
      margin: "0",
    },
    ".cm-panel.cm-search > [name=close]": {
      position: "absolute",
      top: "7px",
      right: "7px",
      width: "24px",
      height: "24px",
      minHeight: "24px",
      margin: "0",
      padding: "0",
      border: "1px solid transparent",
      backgroundColor: "transparent",
      color: "var(--muted-strong)",
      cursor: "pointer",
      fontSize: "16px",
      lineHeight: "1",
    },
    ".cm-panel.cm-search > [name=close]:hover": {
      borderColor: "var(--line-strong)",
      color: "var(--text)",
    },
    ".cm-panel.cm-search > input:focus-visible, .cm-panel.cm-search > button:focus-visible":
      {
        outline: "2px solid var(--accent)",
        outlineOffset: "1px",
      },
    ".cm-searchMatch": {
      backgroundColor: "rgba(183, 160, 127, 0.22)",
      outline: "1px solid rgba(183, 160, 127, 0.4)",
    },
    ".cm-searchMatch-selected.cm-searchMatch-selected": {
      backgroundColor: "rgba(143, 169, 167, 0.3)",
      outline: "1px solid rgba(143, 169, 167, 0.48)",
    },
    ".cm-matchingBracket.cm-matchingBracket": {
      backgroundColor: "rgba(143, 169, 167, 0.18)",
      color: "#adb5bc",
      outline: "1px solid rgba(143, 169, 167, 0.34)",
    },
    ".cm-nonmatchingBracket.cm-nonmatchingBracket": {
      backgroundColor: "rgba(197, 143, 143, 0.14)",
      color: "#c58f8f",
      outline: "1px solid rgba(197, 143, 143, 0.32)",
    },
    ".cm-tooltip": {
      border: "1px solid var(--line-strong)",
      backgroundColor: "var(--panel)",
      color: "var(--text)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "rgba(143, 169, 167, 0.22)",
      color: "var(--text)",
    },
  },
  { dark: true },
);

const gentleSyntaxHighlighting = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: "#77818b",
    fontStyle: "italic",
  },
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.modifier,
      tags.operatorKeyword,
    ],
    color: "#a39bb9",
  },
  {
    tag: [tags.string, tags.character, tags.attributeValue, tags.regexp],
    color: "#9faa88",
  },
  {
    tag: [
      tags.number,
      tags.integer,
      tags.float,
      tags.bool,
      tags.null,
      tags.atom,
    ],
    color: "#b7a07f",
  },
  {
    tag: [tags.typeName, tags.className, tags.tagName, tags.namespace],
    color: "#8fa9a7",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.definition(tags.variableName),
    ],
    color: "#9fadb9",
  },
  {
    tag: [tags.propertyName, tags.attributeName, tags.variableName, tags.name],
    color: "#adb5bc",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
    color: "#8f99a3",
  },
  {
    tag: [tags.meta, tags.processingInstruction],
    color: "#8e9faa",
  },
  {
    tag: tags.invalid,
    color: "#c58f8f",
    textDecoration: "underline dotted",
  },
]);

const japaneseEditorPhrases = EditorState.phrases.of({
  Find: "検索",
  Replace: "置換",
  all: "すべて選択",
  "by word": "単語単位",
  close: "閉じる",
  "current match": "現在の一致",
  "match case": "大文字・小文字",
  next: "次へ",
  "on line": "行",
  previous: "前へ",
  regexp: "正規表現",
  replace: "置換",
  "replace all": "すべて置換",
  "replaced $ matches": "$ 件を置換しました",
  "replaced match on line $": "$ 行目の一致を置換しました",
});

async function loadJavaScriptExtension(
  options: { jsx?: boolean; typescript?: boolean } = {},
): Promise<Extension> {
  const { javascript } = await import("@codemirror/lang-javascript");
  return javascript(options);
}

async function loadLanguageExtension(
  language: CodeLanguage,
): Promise<Extension> {
  switch (language) {
    case "javascript":
      return loadJavaScriptExtension();
    case "typescript":
      return loadJavaScriptExtension({ typescript: true });
    case "jsx":
      return loadJavaScriptExtension({ jsx: true });
    case "tsx":
      return loadJavaScriptExtension({ jsx: true, typescript: true });
    case "python": {
      const { python } = await import("@codemirror/lang-python");
      return python();
    }
    case "html": {
      const { html } = await import("@codemirror/lang-html");
      return html();
    }
    case "css": {
      const { css } = await import("@codemirror/lang-css");
      return css();
    }
    case "json": {
      const { json } = await import("@codemirror/lang-json");
      return json();
    }
    case "sql": {
      const { sql } = await import("@codemirror/lang-sql");
      return sql();
    }
    case "java": {
      const { java } = await import("@codemirror/lang-java");
      return java();
    }
    case "plain":
      return [];
  }
}

function editorStatus(state: EditorState): EditorStatus {
  const head = state.selection.main.head;
  const currentLine = state.doc.lineAt(head);
  return {
    characters: state.doc.length,
    column: head - currentLine.from + 1,
    line: currentLine.number,
    lines: state.doc.lines,
  };
}

const CodeAnswerEditor = forwardRef<
  CodeAnswerEditorHandle,
  CodeAnswerEditorProps
>(function CodeAnswerEditor(
  {
    ariaLabelledBy,
    describedBy,
    disabled = false,
    id,
    language,
    maxLength,
    onChange,
    onLanguageChange,
    onSubmitShortcut,
    placeholder,
    value,
  },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartmentRef = useRef(new Compartment());
  const editableCompartmentRef = useRef(new Compartment());
  const wrappingCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSubmitShortcutRef = useRef(onSubmitShortcut);
  const initialValue = useRef(value).current;
  const initialDisabled = useRef(disabled).current;
  const [expanded, setExpanded] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [limitNotice, setLimitNotice] = useState("");
  const [languageNotice, setLanguageNotice] = useState("");
  const [status, setStatus] = useState<EditorStatus>(() => {
    const initial = EditorState.create({ doc: value });
    return editorStatus(initial);
  });

  onChangeRef.current = onChange;
  onSubmitShortcutRef.current = onSubmitShortcut;

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const languageCompartment = languageCompartmentRef.current;
    const editableCompartment = editableCompartmentRef.current;
    const wrappingCompartment = wrappingCompartmentRef.current;
    const contentAttributes: Record<string, string> = {
      "aria-labelledby": ariaLabelledBy,
      "aria-multiline": "true",
      "aria-roledescription": "コードエディター",
      "aria-keyshortcuts": "Control+Enter Meta+Enter",
      autocapitalize: "off",
      autocomplete: "off",
      id,
      role: "textbox",
      spellcheck: "false",
    };
    if (describedBy) contentAttributes["aria-describedby"] = describedBy;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          basicSetup,
          editorTheme,
          syntaxHighlighting(gentleSyntaxHighlighting),
          japaneseEditorPhrases,
          indentUnit.of(CODE_INDENT_UNIT),
          EditorState.tabSize.of(CODE_INDENT_SIZE),
          EditorState.changeFilter.of((transaction) => {
            if (transaction.newDoc.length <= maxLength) {
              queueMicrotask(() => setLimitNotice(""));
              return true;
            }
            queueMicrotask(() =>
              setLimitNotice(
                `コード回答は ${maxLength.toLocaleString("ja-JP")} 文字までです。`,
              ),
            );
            return false;
          }),
          EditorView.contentAttributes.of(contentAttributes),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet) {
              setStatus(editorStatus(update.state));
            }
          }),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                preventDefault: true,
                run(currentView) {
                  if (currentView.composing) return true;
                  onSubmitShortcutRef.current();
                  return true;
                },
              },
              indentWithTab,
            ]),
          ),
          editorPlaceholder(placeholder),
          languageCompartment.of([]),
          editableCompartment.of([
            EditorState.readOnly.of(initialDisabled),
            EditorView.editable.of(!initialDisabled),
          ]),
          wrappingCompartment.of(EditorView.lineWrapping),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [
    ariaLabelledBy,
    describedBy,
    id,
    initialDisabled,
    initialValue,
    maxLength,
    placeholder,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: {
        anchor: Math.min(value.length, view.state.selection.main.head),
      },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    let cancelled = false;
    void loadLanguageExtension(language)
      .then((extension) => {
        if (cancelled || viewRef.current !== view) return;
        setLanguageNotice("");
        view.dispatch({
          effects: languageCompartmentRef.current.reconfigure(extension),
        });
      })
      .catch(() => {
        if (cancelled || viewRef.current !== view) return;
        setLanguageNotice(
          "選択した言語のハイライトを読み込めなかったため、プレーンテキスト表示で継続しています。",
        );
        view.dispatch({
          effects: languageCompartmentRef.current.reconfigure([]),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure([
        EditorState.readOnly.of(disabled),
        EditorView.editable.of(!disabled),
      ]),
    });
  }, [disabled]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wrappingCompartmentRef.current.reconfigure(
        wrapLines ? EditorView.lineWrapping : [],
      ),
    });
  }, [wrapLines]);

  useEffect(() => {
    if (!expanded) return;
    const root = containerRef.current;
    if (!root) return;
    const rootElement = root;
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";

    const inerted: Array<{ element: HTMLElement; hadInert: boolean }> = [];
    let current: HTMLElement | null = rootElement;
    while (current && current !== document.body) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === current || !(sibling instanceof HTMLElement)) continue;
        const hadInert = sibling.hasAttribute("inert");
        if (!hadInert) sibling.setAttribute("inert", "");
        inerted.push({ element: sibling, hadInert });
      }
      current = parent;
    }

    function focusableElements(): HTMLElement[] {
      return Array.from(
        rootElement.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), .cm-content',
        ),
      ).filter((element) => !element.hasAttribute("inert"));
    }

    function handleKeydown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setExpanded(false);
        return;
      }
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        rootElement.focus();
        return;
      }
      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!(active instanceof Node) || !rootElement.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown, true);
    window.requestAnimationFrame(() => viewRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeydown, true);
      for (const { element, hadInert } of inerted) {
        if (!hadInert) element.removeAttribute("inert");
      }
      const previous = previousFocusRef.current;
      if (previous?.isConnected)
        window.requestAnimationFrame(() => previous.focus());
      previousFocusRef.current = null;
    };
  }, [expanded]);

  function focusAfterToolbarAction() {
    window.requestAnimationFrame(() => viewRef.current?.focus());
  }

  function toggleExpanded() {
    setExpanded((current) => !current);
  }

  function toggleWrapping() {
    setWrapLines((current) => !current);
    focusAfterToolbarAction();
  }

  return (
    <section
      aria-label={expanded ? "コード回答エディター（全画面）" : undefined}
      aria-modal={expanded ? "true" : undefined}
      className={"code-answer-editor" + (expanded ? " expanded" : "")}
      data-code-language={language}
      ref={containerRef}
      role={expanded ? "dialog" : undefined}
      tabIndex={expanded ? -1 : undefined}
    >
      <header className="code-editor-toolbar">
        <label>
          <span>言語</span>
          <select
            aria-label="コードの言語モード"
            disabled={disabled}
            onChange={(event) =>
              onLanguageChange(event.target.value as CodeLanguage)
            }
            value={language}
          >
            {CODE_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="code-editor-tools">
          <button
            aria-label={
              wrapLines ? "長い行の折り返しを解除" : "長い行を折り返す"
            }
            aria-pressed={wrapLines}
            disabled={disabled}
            onClick={toggleWrapping}
            title={wrapLines ? "行の折り返しを解除" : "行を折り返す"}
            type="button"
          >
            <WrapText size={15} />
            <span>折り返し</span>
          </button>
          <button
            aria-label={
              expanded
                ? "コードエディターを元の大きさに戻す"
                : "コードエディターを拡大"
            }
            aria-pressed={expanded}
            onClick={toggleExpanded}
            title={expanded ? "元の大きさに戻す" : "画面いっぱいに拡大"}
            type="button"
          >
            {expanded ? <Minimize2 size={15} /> : <Expand size={15} />}
            <span>{expanded ? "縮小" : "拡大"}</span>
          </button>
        </div>
      </header>
      <div className="code-editor-host" ref={hostRef} />
      <footer className="code-editor-status">
        <span>
          行 {status.line}、列 {status.column}
        </span>
        <span>{status.lines} 行</span>
        <span>
          {status.characters.toLocaleString("ja-JP")} /{" "}
          {maxLength.toLocaleString("ja-JP")} 文字
        </span>
        <span>Tabで4スペース分インデント · Ctrl / ⌘ + Fで検索・置換</span>
      </footer>
      {(limitNotice || languageNotice) && (
        <p className="code-editor-notice" role="status" aria-live="polite">
          {limitNotice || languageNotice}
        </p>
      )}
    </section>
  );
});

export default CodeAnswerEditor;
