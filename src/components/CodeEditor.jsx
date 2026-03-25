import React, { useEffect, useRef, useCallback, useState } from "react";
import { useApp } from "../context/AppContext";
import Toolbar from "./Toolbar";
import StatusBar from "./StatusBar";

// CodeMirror core
import {
  EditorView,
  gutter,
  GutterMarker,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  placeholder,
} from "@codemirror/view";
import {
  EditorState,
  StateField,
  StateEffect,
  RangeSetBuilder,
  Compartment,
} from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  moveLineUp,
  moveLineDown,
  deleteLine,
  copyLineDown,
  selectLine,
  undo,
  redo,
} from "@codemirror/commands";
import {
  searchKeymap,
  highlightSelectionMatches,
  search,
} from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldKeymap,
  codeFolding,
} from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";

// Language support
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";

// ─── LINE MARKERS ─────────────────────────────────────────────────────────────
const MARKER_CYCLE = [
  null,
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
];

const setMarkerEffect = StateEffect.define();

const markerField = StateField.define({
  create: () => new Map(),
  update(markers, tr) {
    let changed = false;
    for (const e of tr.effects) {
      if (e.is(setMarkerEffect)) {
        if (!changed) {
          markers = new Map(markers);
          changed = true;
        }
        const { line, color } = e.value;
        if (!color) markers.delete(line);
        else markers.set(line, color);
      }
    }
    return markers;
  },
});

class DotMarker extends GutterMarker {
  constructor(color) {
    super();
    this.color = color;
  }
  eq(other) {
    return other instanceof DotMarker && other.color === this.color;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-dot-marker";
    el.style.cssText = `width:9px;height:9px;border-radius:50%;background:${this.color};cursor:pointer;margin:0 auto;flex-shrink:0;transition:transform 0.1s;box-shadow:0 0 4px ${this.color}88;`;
    return el;
  }
}

class EmptyDot extends GutterMarker {
  eq(other) {
    return other instanceof EmptyDot;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-dot-marker cm-dot-empty";
    el.style.cssText =
      "width:9px;height:9px;border-radius:50%;cursor:pointer;margin:0 auto;border:1px solid #ffffff18;";
    return el;
  }
}

const emptyDot = new EmptyDot();

function buildMarkerGutter(onMarkerChange) {
  // Drag state (module-level to survive re-renders)
  let dragging = false,
    dragColor = null;
  let rightHeld = false,
    lastColor = null;

  return [
    markerField,
    gutter({
      class: "cm-marker-gutter",
      markers(view) {
        const map = view.state.field(markerField);
        if (map.size === 0) return RangeSetBuilder.empty;
        const builder = new RangeSetBuilder();
        const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);
        for (const [lineNum, color] of sorted) {
          if (lineNum > view.state.doc.lines) continue;
          const line = view.state.doc.line(lineNum);
          builder.add(line.from, line.from, new DotMarker(color));
        }
        return builder.finish();
      },
      initialSpacer: () => emptyDot,
      domEventHandlers: {
        contextmenu(view, line, event) {
          event.preventDefault();
          const lineNum = view.state.doc.lineAt(line.from).number;
          const map = view.state.field(markerField);
          lastColor = map.get(lineNum) || MARKER_CYCLE[1];
          rightHeld = true;
          const up = () => {
            rightHeld = false;
          };
          document.addEventListener("mouseup", up, { once: true });
          return true;
        },
        mousedown(view, line, event) {
          if (event.button !== 0) return false;
          const lineNum = view.state.doc.lineAt(line.from).number;
          const map = view.state.field(markerField);

          let newColor;
          if (rightHeld && lastColor) {
            newColor = lastColor;
          } else {
            const cur = map.get(lineNum) ?? null;
            const idx = MARKER_CYCLE.indexOf(cur);
            newColor = MARKER_CYCLE[(idx + 1) % MARKER_CYCLE.length];
          }

          view.dispatch({
            effects: setMarkerEffect.of({ line: lineNum, color: newColor }),
          });
          onMarkerChange?.(lineNum, newColor);

          dragging = true;
          dragColor = newColor;
          lastColor = newColor;

          const onMove = (e) => {
            if (!dragging) return;
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos == null) return;
            const dl = view.state.doc.lineAt(pos).number;
            const cur = view.state.field(markerField).get(dl);
            if (cur !== dragColor) {
              view.dispatch({
                effects: setMarkerEffect.of({ line: dl, color: dragColor }),
              });
              onMarkerChange?.(dl, dragColor);
            }
          };
          const onUp = () => {
            dragging = false;
            dragColor = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
          return true;
        },
      },
    }),
  ];
}

// ─── LANGUAGE DETECTION ───────────────────────────────────────────────────────
function detectLanguage(content = "", title = "") {
  const t = title.toLowerCase();
  const c = content.slice(0, 500).toLowerCase();
  if (
    t.endsWith(".sql") ||
    c.includes("select ") ||
    c.includes("insert ") ||
    c.includes("create table")
  )
    return sql();
  if (t.endsWith(".json") || (c.startsWith("{") && c.includes('"')))
    return json();
  if (
    t.endsWith(".py") ||
    c.includes("def ") ||
    c.includes("import ") ||
    c.includes("print(")
  )
    return python();
  if (
    t.endsWith(".js") ||
    t.endsWith(".jsx") ||
    t.endsWith(".ts") ||
    c.includes("function") ||
    c.includes("=>")
  )
    return javascript();
  if (
    t.endsWith(".yml") ||
    t.endsWith(".yaml") ||
    c.includes("---\n") ||
    /^\w+:\s/m.test(c)
  )
    return yaml();
  return null;
}

// ─── COMPARTMENTS (for runtime config changes) ────────────────────────────────
const langCompartment = new Compartment();
const wrapCompartment = new Compartment();
const whitespaceCompartment = new Compartment();
const themeCompartment = new Compartment();
const fontSizeCompartment = new Compartment();

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function CodeEditor() {
  const { activeTab, updateTabContent, settings } = useApp();
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const currentTabId = useRef(null);
  const suppressSync = useRef(false);
  const [fontSize, setFontSize] = useState(settings.fontSize || 14);
  const [wordWrap, setWordWrap] = useState(settings.wordWrap || false);
  const [showWS, setShowWS] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [cursorInfo, setCursorInfo] = useState({
    line: 1,
    col: 1,
    sel: 0,
    lines: 0,
  });

  // ── Build extension set ──────────────────────────────────────────────────
  const buildExtensions = useCallback(
    (onMarkerChange) => [
      EditorView.editable.of(true),
      EditorState.readOnly.of(false),
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      ...buildMarkerGutter(onMarkerChange),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightSelectionMatches(),
      highlightActiveLine(),
      search({ top: true }),
      codeFolding(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...closeBracketsKeymap,
        ...foldKeymap,
        indentWithTab,
        { key: "Alt-ArrowUp", run: moveLineUp },
        { key: "Alt-ArrowDown", run: moveLineDown },
        { key: "Ctrl-Shift-k", run: deleteLine },
        { key: "Ctrl-d", run: copyLineDown },
      ]),
      oneDark,
      langCompartment.of([]),
      wrapCompartment.of(EditorView.lineWrapping),
      fontSizeCompartment.of(
        EditorView.theme({ "&": { fontSize: `${fontSize}px` } }),
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !suppressSync.current) {
          const content = update.state.doc.toString();
          updateTabContent(currentTabId.current, content);
        }
        if (update.selectionSet || update.docChanged) {
          const state = update.state;
          const main = state.selection.main;
          const line = state.doc.lineAt(main.head);
          setCursorInfo({
            line: line.number,
            col: main.head - line.from + 1,
            sel: Math.abs(main.to - main.from),
            lines: state.doc.lines,
          });
        }
      }),
      EditorView.theme({
        "&": {
          height: "100%",
          background: "#0d0d0f",
          WebkitAppRegion: "no-drag",
          pointerEvents: "all",
        },
        ".cm-content": {
          fontFamily:
            settings.fontFamily || "'JetBrains Mono', Consolas, monospace",
          caretColor: "#a78bfa",
          WebkitUserSelect: "text",
          userSelect: "text",
        },
        ".cm-scroller": { overflow: "auto" },
        ".cm-gutters": {
          background: "#111116",
          borderRight: "1px solid #2a2a35",
          color: "#4a4a60",
        },
        ".cm-lineNumbers .cm-gutterElement": {
          color: "#3d3d50",
          minWidth: "40px",
          textAlign: "right",
          padding: "0 8px 0 4px",
        },
        ".cm-marker-gutter": {
          width: "18px",
          background: "#0f0f14",
          borderRight: "1px solid #1e1e2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
        ".cm-activeLine": { background: "#1a1a2e" },
        ".cm-activeLineGutter": { background: "#161625" },
        ".cm-selectionBackground": { background: "#312e8180 !important" },
        ".cm-focused .cm-selectionBackground": {
          background: "#4c1d9580 !important",
        },
        ".cm-cursor": { borderLeftColor: "#a78bfa" },
        ".cm-foldGutter .cm-gutterElement": {
          color: "#4a4a60",
          cursor: "pointer",
          padding: "0 2px",
        },
        ".cm-searchMatch": {
          background: "#f59e0b40",
          borderBottom: "1px solid #f59e0b",
        },
        ".cm-searchMatch.cm-searchMatch-selected": { background: "#f59e0b80" },
      }),
    ],
    [fontSize, settings.fontFamily, updateTabContent],
  );

  // ── Initialize editor ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const onMarkerChange = async (lineNum, color) => {
      const tabId = currentTabId.current;
      if (!tabId) return;
      const tab = activeTab; // we use closure — this is fine as ref-read
      if (tab?.document_id) {
        window.vault.marker.set({
          docId: tab.document_id,
          line: lineNum,
          color: color || null,
        });
      }
    };

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: buildExtensions(onMarkerChange),
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // ── Sync content when active tab changes ─────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeTab) return;
    if (currentTabId.current === activeTab.id) return;

    currentTabId.current = activeTab.id;
    suppressSync.current = true;

    const content = activeTab.content || "";
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      effects: [
        langCompartment.reconfigure(
          detectLanguage(content, activeTab.title) || [],
        ),
        wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        fontSizeCompartment.reconfigure(
          EditorView.theme({ "&": { fontSize: `${fontSize}px` } }),
        ),
      ],
    });

    // Clear all markers, then load from DB
    const currentMarkers = view.state.field(markerField);
    for (const line of currentMarkers.keys()) {
      view.dispatch({ effects: setMarkerEffect.of({ line, color: null }) });
    }

    if (activeTab.document_id) {
      window.vault.marker.get(activeTab.document_id).then((markers) => {
        for (const m of markers) {
          if (m.line_number <= view.state.doc.lines) {
            view.dispatch({
              effects: setMarkerEffect.of({
                line: m.line_number,
                color: m.color,
              }),
            });
          }
        }
      });
    }

    setTimeout(() => {
      suppressSync.current = false;
    }, 0);
    view.focus();
  }, [activeTab?.id]);

  // ── Word wrap toggle ─────────────────────────────────────────────────────
  const toggleWordWrap = useCallback(() => {
    const next = !wordWrap;
    setWordWrap(next);
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(next ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  // ── Whitespace toggle ────────────────────────────────────────────────────
  const toggleWhitespace = useCallback(() => setShowWS((p) => !p), []);

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const zoomIn = () => {
    const f = Math.min(fontSize + 1, 28);
    setFontSize(f);
    viewRef.current?.dispatch({
      effects: fontSizeCompartment.reconfigure(
        EditorView.theme({ "&": { fontSize: `${f}px` } }),
      ),
    });
  };
  const zoomOut = () => {
    const f = Math.max(fontSize - 1, 9);
    setFontSize(f);
    viewRef.current?.dispatch({
      effects: fontSizeCompartment.reconfigure(
        EditorView.theme({ "&": { fontSize: `${f}px` } }),
      ),
    });
  };

  // ── Fold all / unfold all ─────────────────────────────────────────────────
  const foldAll = () => {
    if (viewRef.current) {
      const { foldAll } = require("@codemirror/language");
      foldAll(viewRef.current);
    }
  };
  const unfoldAll = () => {
    if (viewRef.current) {
      const { unfoldAll } = require("@codemirror/language");
      unfoldAll(viewRef.current);
    }
  };

  // ── Toggle find ───────────────────────────────────────────────────────────
  const toggleFind = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const { openSearchPanel, closeSearchPanel } = require("@codemirror/search");
    if (showFind) {
      closeSearchPanel(view);
      setShowFind(false);
    } else {
      openSearchPanel(view);
      setShowFind(true);
    }
  }, [showFind]);

  // ── AI Prettify ──────────────────────────────────────────────────────────
  const handlePrettify = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !activeTab) return;
    const content = view.state.doc.toString();
    if (!content.trim()) return;

    const s = await window.vault.settings.get();
    const useGemini = s.defaultAI === "gemini";
    const apiKey = useGemini ? s.geminiApiKey : s.deepseekApiKey;
    if (!apiKey) {
      alert("No API key set. Go to Settings → AI.");
      return;
    }

    const system = `You are a technical documentation formatter for a developer knowledge base. 
Analyze and restructure pasted content into clean, well-organized documentation.

Rules:
- Detect content types: SQL queries, CLI commands, config, Wireshark/network filters, credentials, notes
- Add section dividers: ═══════ SECTION TITLE ═══════════════════════════════
- Wrap code/SQL/commands in markdown code blocks with language tags (\`\`\`sql, \`\`\`bash, \`\`\`filter, etc.)
- Format SQL with proper indentation (2 spaces)
- Add a 1-line comment above each block describing what it does
- Group related queries/commands together under the same section
- For credentials: use KEY = VALUE format under a [CREDENTIALS] section
- For Wireshark/RADIUS: use \`\`\`wireshark code blocks
- Keep ALL original content — only organize and format
- Return ONLY the formatted content, no preamble or explanations`;

    const messages = [
      { role: "user", content: `Format this content:\n\n${content}` },
    ];

    let result;
    if (useGemini) {
      result = await window.vault.ai.gemini({
        apiKey,
        model: s.geminiModel,
        messages,
        system,
      });
    } else {
      result = await window.vault.ai.deepseek({
        apiKey,
        model: s.deepseekModel,
        messages,
        system,
      });
    }

    if (result.ok) {
      suppressSync.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: result.text },
      });
      updateTabContent(activeTab.id, result.text);
      setTimeout(() => {
        suppressSync.current = false;
      }, 100);
    } else {
      alert("AI error: " + result.error);
    }
  }, [activeTab, updateTabContent]);

  // ── Keyboard shortcuts for zoom ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn();
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        zoomOut();
      }
      if (mod && e.key === "f") {
        e.preventDefault();
        toggleFind();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFind, fontSize]);

  if (!activeTab) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-icon">⬡</div>
        <div className="editor-empty-text">
          Select a document or create a scratch pad
        </div>
        <button className="editor-empty-btn" onClick={() => {}}>
          New Scratch Pad
        </button>
      </div>
    );
  }

  return (
    <div className="code-editor-wrap">
      <Toolbar
        onPrettify={handlePrettify}
        onToggleFind={toggleFind}
        onToggleWordWrap={toggleWordWrap}
        wordWrap={wordWrap}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFoldAll={foldAll}
        onUnfoldAll={unfoldAll}
        onToggleWhitespace={toggleWhitespace}
        showWhitespace={showWS}
      />
      <div ref={containerRef} className="cm-container" />
      <StatusBar cursorInfo={cursorInfo} fontSize={fontSize} />
    </div>
  );
}
