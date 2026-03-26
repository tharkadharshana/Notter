import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import Toolbar   from './Toolbar';
import StatusBar from './StatusBar';

// CodeMirror core
import { EditorView, gutter, GutterMarker, keymap, lineNumbers,
         highlightActiveLineGutter, drawSelection, dropCursor,
         rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSetBuilder, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab,
         moveLineUp, moveLineDown, deleteLine, copyLineDown } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, search,
         openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle,
         bracketMatching, foldKeymap, codeFolding,
         foldAll as cmFoldAll, unfoldAll as cmUnfoldAll } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { sql }        from '@codemirror/lang-sql';
import { javascript }  from '@codemirror/lang-javascript';
import { python }      from '@codemirror/lang-python';
import { yaml }        from '@codemirror/lang-yaml';
import { json }        from '@codemirror/lang-json';

// ─── LINE MARKERS ─────────────────────────────────────────────────────────────
const MARKER_CYCLE = [null, '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];

const setMarkerEffect = StateEffect.define();

const markerField = StateField.define({
  create: () => new Map(),
  update(markers, tr) {
    let changed = false;
    for (const e of tr.effects) {
      if (e.is(setMarkerEffect)) {
        if (!changed) { markers = new Map(markers); changed = true; }
        const { line, color } = e.value;
        if (!color) markers.delete(line);
        else markers.set(line, color);
      }
    }
    return markers;
  }
});

class DotMarker extends GutterMarker {
  constructor(color) { super(); this.color = color; }
  eq(other) { return other instanceof DotMarker && other.color === this.color; }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-dot-marker';
    el.style.cssText = `width:9px;height:9px;border-radius:50%;background:${this.color};cursor:pointer;margin:0 auto;flex-shrink:0;transition:transform 0.1s;box-shadow:0 0 4px ${this.color}88;`;
    return el;
  }
}

class EmptyDot extends GutterMarker {
  eq(other) { return other instanceof EmptyDot; }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-dot-marker cm-dot-empty';
    el.style.cssText = 'width:9px;height:9px;border-radius:50%;cursor:pointer;margin:0 auto;border:1px solid #ffffff18;';
    return el;
  }
}
const emptyDot = new EmptyDot();

// Drag state lives outside component so it survives re-renders
let _dragging = false, _dragColor = null, _rightHeld = false, _lastColor = null;

function buildMarkerGutter(onMarkerChangeFn) {
  return [
    markerField,
    gutter({
      class: 'cm-marker-gutter',
      markers(view) {
        const map = view.state.field(markerField);
        if (map.size === 0) return RangeSetBuilder.empty;
        const builder = new RangeSetBuilder();
        const sorted  = [...map.entries()].sort((a, b) => a[0] - b[0]);
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
          const lineNum  = view.state.doc.lineAt(line.from).number;
          const map      = view.state.field(markerField);
          _lastColor     = map.get(lineNum) || MARKER_CYCLE[1];
          _rightHeld     = true;
          document.addEventListener('mouseup', () => { _rightHeld = false; }, { once: true });
          return true;
        },
        mousedown(view, line, event) {
          if (event.button !== 0) return false;
          const lineNum = view.state.doc.lineAt(line.from).number;
          const map     = view.state.field(markerField);

          let newColor;
          if (_rightHeld && _lastColor) {
            newColor = _lastColor;
          } else {
            const cur = map.get(lineNum) ?? null;
            const idx = MARKER_CYCLE.indexOf(cur);
            newColor  = MARKER_CYCLE[(idx + 1) % MARKER_CYCLE.length];
          }

          view.dispatch({ effects: setMarkerEffect.of({ line: lineNum, color: newColor }) });
          onMarkerChangeFn(lineNum, newColor);

          _dragging  = true;
          _dragColor = newColor;
          _lastColor = newColor;

          const onMove = (e) => {
            if (!_dragging) return;
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos == null) return;
            const dl  = view.state.doc.lineAt(pos).number;
            if (view.state.field(markerField).get(dl) !== _dragColor) {
              view.dispatch({ effects: setMarkerEffect.of({ line: dl, color: _dragColor }) });
              onMarkerChangeFn(dl, _dragColor);
            }
          };
          const onUp = () => {
            _dragging = false; _dragColor = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup',   onUp);
          return true;
        }
      }
    })
  ];
}

// ─── LANGUAGE DETECTION ───────────────────────────────────────────────────────
function detectLanguage(content = '', title = '') {
  const t = title.toLowerCase();
  const c = (content || '').slice(0, 500).toLowerCase();
  if (t.endsWith('.sql') || /\b(select|insert|update|delete|create table|drop table)\b/.test(c)) return sql();
  if (t.endsWith('.json') || (c.trimStart().startsWith('{') && c.includes('"'))) return json();
  if (t.endsWith('.py')   || /\b(def |import |print\(|class )/.test(c)) return python();
  if (t.endsWith('.js') || t.endsWith('.jsx') || t.endsWith('.ts') || /\b(function|const |let |=>)\b/.test(c)) return javascript();
  if (t.endsWith('.yml')  || t.endsWith('.yaml') || /^\w[\w-]+:\s/m.test(c)) return yaml();
  return null;
}

// ─── COMPARTMENTS ─────────────────────────────────────────────────────────────
const langCompartment      = new Compartment();
const wrapCompartment      = new Compartment();
const fontSizeCompartment  = new Compartment();

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function CodeEditor() {
  const { activeTab, updateTabContent, settings } = useApp();

  const containerRef    = useRef(null);
  const viewRef         = useRef(null);
  const currentTabId    = useRef(null);
  const suppressSync    = useRef(false);
  // FIX #2: keep a ref to updateTabContent so the EditorView listener always calls the latest version
  const updateTabRef    = useRef(updateTabContent);
  // FIX #3: keep a ref to activeTab so onMarkerChange always has the current tab
  const activeTabRef    = useRef(activeTab);

  const [fontSize,   setFontSize]   = useState(settings.fontSize || 14);
  const [wordWrap,   setWordWrap]   = useState(settings.wordWrap  || false);
  const [showWS,     setShowWS]     = useState(false);
  const [showFind,   setShowFind]   = useState(false);
  const [cursorInfo, setCursorInfo] = useState({ line:1, col:1, sel:0, lines:0 });

  // Keep refs fresh on every render
  useEffect(() => { updateTabRef.current = updateTabContent; }, [updateTabContent]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // ── FIX #1: Initialize editor once — ALWAYS, regardless of activeTab ────
  // We NEVER conditionally render cm-container. The editor is created unconditionally.
  // The empty-state overlay is shown on top of the editor when no tab is open.
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const onMarkerChange = (lineNum, color) => {
      // FIX #3: use ref so we always get the current tab
      const tab = activeTabRef.current;
      if (tab?.document_id) {
        window.vault.marker.set({ docId: tab.document_id, line: lineNum, color: color || null });
      }
    };

    const fontTheme = EditorView.theme({
      '&': { height: '100%', background: '#0d0d0f' },
      '.cm-content': {
        fontFamily: settings.fontFamily || "'JetBrains Mono', Consolas, monospace",
        caretColor: '#a78bfa',
        // FIX #5: explicitly enable user-select inside editor
        userSelect: 'text', WebkitUserSelect: 'text',
      },
      '.cm-scroller': { overflow: 'auto' },
      '.cm-gutters': { background: '#111116', borderRight: '1px solid #2a2a35', color: '#4a4a60' },
      '.cm-lineNumbers .cm-gutterElement': { color: '#3d3d50', minWidth: '40px', textAlign: 'right', padding: '0 8px 0 4px' },
      '.cm-marker-gutter': { width: '18px', background: '#0f0f14', borderRight: '1px solid #1e1e2a', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      '.cm-activeLine': { background: '#1a1a2e' },
      '.cm-activeLineGutter': { background: '#161625' },
      '.cm-selectionBackground': { background: '#312e8180 !important' },
      '.cm-focused .cm-selectionBackground': { background: '#4c1d9580 !important' },
      '.cm-cursor': { borderLeftColor: '#a78bfa' },
      '.cm-foldGutter .cm-gutterElement': { color: '#4a4a60', cursor: 'pointer', padding: '0 2px' },
      '.cm-searchMatch': { background: '#f59e0b40', borderBottom: '1px solid #f59e0b' },
      '.cm-searchMatch.cm-searchMatch-selected': { background: '#f59e0b80' },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
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
            { key: 'Alt-ArrowUp',   run: moveLineUp   },
            { key: 'Alt-ArrowDown', run: moveLineDown  },
            { key: 'Ctrl-Shift-k',  run: deleteLine    },
            { key: 'Ctrl-d',        run: copyLineDown  },
          ]),
          oneDark,
          fontTheme,
          langCompartment.of([]),
          wrapCompartment.of([]),
          fontSizeCompartment.of(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
          // FIX #2: update listener always calls ref — never stale
          EditorView.updateListener.of(update => {
            if (update.docChanged && !suppressSync.current) {
              const content = update.state.doc.toString();
              updateTabRef.current(currentTabId.current, content);
            }
            if (update.selectionSet || update.docChanged) {
              const state = update.state;
              const main  = state.selection.main;
              const line  = state.doc.lineAt(main.head);
              setCursorInfo({
                line:  line.number,
                col:   main.head - line.from + 1,
                sel:   Math.abs(main.to - main.from),
                lines: state.doc.lines
              });
            }
          }),
        ]
      }),
      parent: containerRef.current
    });

    viewRef.current = view;

    return () => {
      if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — editor lives for component lifetime

  // ── Sync content when active tab changes ─────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeTab) return;
    if (currentTabId.current === activeTab.id) return;

    currentTabId.current = activeTab.id;
    suppressSync.current = true;

    const content = activeTab.content || '';
    const lang    = detectLanguage(content, activeTab.title);

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      effects: [
        langCompartment.reconfigure(lang ? lang : []),
        wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        fontSizeCompartment.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
      ]
    });

    // Clear markers then load from DB
    const currentMarkers = view.state.field(markerField);
    for (const line of currentMarkers.keys()) {
      view.dispatch({ effects: setMarkerEffect.of({ line, color: null }) });
    }
    if (activeTab.document_id) {
      window.vault.marker.get(activeTab.document_id).then(markers => {
        if (!markers) return;
        for (const m of markers) {
          if (m.line_number <= view.state.doc.lines) {
            view.dispatch({ effects: setMarkerEffect.of({ line: m.line_number, color: m.color }) });
          }
        }
      });
    }

    setTimeout(() => { suppressSync.current = false; }, 50);
    view.focus();
  }, [activeTab?.id]); // eslint-disable-line

  // ── Word wrap toggle ─────────────────────────────────────────────────────
  const toggleWordWrap = useCallback(() => {
    setWordWrap(prev => {
      const next = !prev;
      viewRef.current?.dispatch({ effects: wrapCompartment.reconfigure(next ? EditorView.lineWrapping : []) });
      return next;
    });
  }, []);

  const toggleWhitespace = useCallback(() => setShowWS(p => !p), []);

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setFontSize(f => {
      const next = Math.min(f + 1, 28);
      viewRef.current?.dispatch({ effects: fontSizeCompartment.reconfigure(EditorView.theme({ '&': { fontSize: `${next}px` } })) });
      return next;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setFontSize(f => {
      const next = Math.max(f - 1, 9);
      viewRef.current?.dispatch({ effects: fontSizeCompartment.reconfigure(EditorView.theme({ '&': { fontSize: `${next}px` } })) });
      return next;
    });
  }, []);

  // ── FIX #4: static imports — no require() at runtime ────────────────────
  const foldAll   = useCallback(() => { if (viewRef.current) cmFoldAll(viewRef.current);   }, []);
  const unfoldAll = useCallback(() => { if (viewRef.current) cmUnfoldAll(viewRef.current); }, []);

  // ── Find panel ─────────────────────────────────────────────────────────────
  const toggleFind = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (showFind) { closeSearchPanel(view); setShowFind(false); }
    else          { openSearchPanel(view);  setShowFind(true);  }
  }, [showFind]);

  // ── AI Prettify ──────────────────────────────────────────────────────────
  const handlePrettify = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !activeTabRef.current) return;
    const content = view.state.doc.toString();
    if (!content.trim()) { alert('Nothing to prettify — editor is empty'); return; }

    const s       = await window.vault.settings.get();
    const useGem  = s.defaultAI === 'gemini';
    const apiKey  = useGem ? s.geminiApiKey : s.deepseekApiKey;
    if (!apiKey)  { alert(`No API key set. Go to Settings → AI and add your ${useGem ? 'Gemini' : 'DeepSeek'} API key.`); return; }

    const customInstructions = s.prettifyPrompt ? `\nAdditional instructions: ${s.prettifyPrompt}` : '';
    const system = `You are a technical documentation formatter for a developer knowledge base.
Analyze and restructure pasted content into clean, well-organized documentation.

Rules:
- Detect content types: SQL queries, CLI commands, config blocks, Wireshark/network filters, credentials, notes
- Add clear section dividers: ═══════════ SECTION TITLE ═══════════════════════════════
- Wrap all code/SQL/commands in markdown fenced code blocks with language tags (\`\`\`sql, \`\`\`bash, \`\`\`wireshark, etc.)
- Format SQL with proper 2-space indentation
- Add a short comment above each block describing what it does
- Group related queries/commands under the same section
- For credentials: KEY = VALUE format under a [CREDENTIALS] section, mark current vs retired versions clearly
- For Wireshark/RADIUS filters: use \`\`\`wireshark blocks
- Keep ALL original content — only organize, format, and label
- Return ONLY the formatted content — no preamble, no explanations${customInstructions}`;

    const messages = [{ role: 'user', content: `Format and organize this content:\n\n${content}` }];

    let result;
    if (useGem) {
      result = await window.vault.ai.gemini({ apiKey, model: s.geminiModel || 'gemini-2.0-flash', messages, system });
    } else {
      result = await window.vault.ai.deepseek({ apiKey, model: s.deepseekModel || 'deepseek-chat', messages, system });
    }

    if (result.ok) {
      const tab = activeTabRef.current;
      suppressSync.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.text } });
      updateTabRef.current(tab.id, result.text);
      setTimeout(() => { suppressSync.current = false; }, 100);
    } else {
      alert('AI error: ' + result.error);
    }
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); }
      if (mod && e.key === '-')                    { e.preventDefault(); zoomOut(); }
      if (mod && e.key === 'f')                    { e.preventDefault(); toggleFind(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomIn, zoomOut, toggleFind]);

  const noTab = !activeTab;

  // FIX #1: ALWAYS render cm-container. Show empty-state as overlay — never unmount the editor div.
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
        hasActiveTab={!noTab}
      />

      <div className="editor-body">
        {/* cm-container is ALWAYS rendered so EditorView always has a DOM parent */}
        <div ref={containerRef} className="cm-container" style={{ visibility: noTab ? 'hidden' : 'visible' }} />

        {/* Empty state overlay — shown on top when no tab is open */}
        {noTab && (
          <div className="editor-empty">
            <div className="editor-empty-icon">⬡</div>
            <div className="editor-empty-text">Open a document or create a scratch pad</div>
          </div>
        )}
      </div>

      <StatusBar cursorInfo={cursorInfo} fontSize={fontSize} />
    </div>
  );
}
