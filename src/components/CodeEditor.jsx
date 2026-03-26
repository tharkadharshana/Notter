import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import Toolbar   from './Toolbar';
import StatusBar from './StatusBar';

import { EditorView, gutter, GutterMarker, keymap, lineNumbers,
         highlightActiveLineGutter, drawSelection, dropCursor,
         rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSetBuilder, RangeSet, Compartment } from '@codemirror/state';
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
import { javascript } from '@codemirror/lang-javascript';
import { python }     from '@codemirror/lang-python';
import { yaml }       from '@codemirror/lang-yaml';
import { json }       from '@codemirror/lang-json';

// ═══════════════════════════════════════════════════════════════════════
// LINE MARKER SYSTEM
// ═══════════════════════════════════════════════════════════════════════

const MARKER_COLORS = [null, '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];

// Effects
const setMarkerEffect = StateEffect.define();
const setTagEffect    = StateEffect.define(); // { color, tag: {emoji,text} | null }

// Marker state: Map<lineNumber, color>
const markerField = StateField.define({
  create: () => new Map(),
  update(markers, tr) {
    let m = markers;
    for (const e of tr.effects) {
      if (e.is(setMarkerEffect)) {
        m = new Map(m);
        if (!e.value.color) m.delete(e.value.line);
        else m.set(e.value.line, e.value.color);
      }
    }
    return m;
  }
});

// Tag state: Map<color, {emoji, text}>  — one tag per color per document
const tagField = StateField.define({
  create: () => new Map(),
  update(tags, tr) {
    let t = tags;
    for (const e of tr.effects) {
      if (e.is(setTagEffect)) {
        t = new Map(t);
        if (!e.value.tag) t.delete(e.value.color);
        else t.set(e.value.color, e.value.tag);
      }
    }
    return t;
  }
});

// GutterMarker class — renders a colored dot, optionally with an emoji tag
class DotMarker extends GutterMarker {
  constructor(color, tag) { super(); this.color = color; this.tag = tag || null; }
  eq(other) {
    return other instanceof DotMarker &&
      other.color === this.color &&
      other.tag?.emoji === this.tag?.emoji &&
      other.tag?.text  === this.tag?.text;
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-dot-marker';
    if (this.tag?.emoji) {
      el.style.cssText = `font-size:11px;line-height:18px;cursor:pointer;text-align:center;width:16px;user-select:none;`;
      el.textContent = this.tag.emoji;
      if (this.tag.text) el.title = this.tag.text;
    } else {
      el.style.cssText = `width:9px;height:9px;border-radius:50%;background:${this.color};cursor:pointer;margin:0 auto;transition:transform 0.1s;box-shadow:0 0 5px ${this.color}99;`;
      if (this.tag?.text) el.title = this.tag.text;
    }
    return el;
  }
}

class EmptyDot extends GutterMarker {
  eq(other) { return other instanceof EmptyDot; }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-dot-empty';
    el.style.cssText = 'width:8px;height:8px;border-radius:50%;cursor:pointer;margin:0 auto;border:1px solid transparent;transition:border-color 0.15s;';
    return el;
  }
}
const emptyDot = new EmptyDot();

// Module-level drag/interaction state (survives re-renders)
let _dragging     = false;
let _dragColor    = null;
let _rightHeld    = false;
let _lastColor    = null;
let _openTagMenu  = null; // set by component — (color, x, y) => void

function buildMarkerGutter(onMarkerChangeFn) {
  return [
    markerField,
    tagField,
    gutter({
      class: 'cm-marker-gutter',
      markers(view) {
        const map  = view.state.field(markerField);
        const tags = view.state.field(tagField);
        // ✅ FIX: was RangeSetBuilder.empty (doesn't exist) — correct is RangeSet.empty
        if (map.size === 0) return RangeSet.empty;
        const builder = new RangeSetBuilder();
        const sorted  = [...map.entries()].sort((a, b) => a[0] - b[0]);
        for (const [lineNum, color] of sorted) {
          if (lineNum > view.state.doc.lines) continue;
          const line = view.state.doc.line(lineNum);
          const tag  = tags.get(color) || null;
          builder.add(line.from, line.from, new DotMarker(color, tag));
        }
        return builder.finish();
      },
      initialSpacer: () => emptyDot,
      domEventHandlers: {
        // Right-click on a dot → either set up right-hold OR open tag menu
        contextmenu(view, line, event) {
          event.preventDefault();
          const lineNum = view.state.doc.lineAt(line.from).number;
          const map     = view.state.field(markerField);
          const existing = map.get(lineNum);

          if (existing) {
            // Open tag menu for this color
            _openTagMenu?.(existing, event.clientX, event.clientY);
          } else {
            // Set up right-hold for copy-to-click mode
            _lastColor = _lastColor || MARKER_COLORS[1];
            _rightHeld = true;
            document.addEventListener('mouseup', () => { _rightHeld = false; }, { once: true });
          }
          return true;
        },
        mousedown(view, line, event) {
          if (event.button !== 0) return false;
          const lineNum = view.state.doc.lineAt(line.from).number;
          const map     = view.state.field(markerField);

          // Ctrl+click → remove dot
          if (event.ctrlKey || event.metaKey) {
            view.dispatch({ effects: setMarkerEffect.of({ line: lineNum, color: null }) });
            onMarkerChangeFn(lineNum, null);
            return true;
          }

          let newColor;
          if (_rightHeld && _lastColor) {
            // Right-hold + left-click: stamp with last used color
            newColor = _lastColor;
          } else {
            // Normal click: cycle colors
            const cur = map.get(lineNum) ?? null;
            const idx = MARKER_COLORS.indexOf(cur);
            newColor  = MARKER_COLORS[(idx + 1) % MARKER_COLORS.length];
          }

          view.dispatch({ effects: setMarkerEffect.of({ line: lineNum, color: newColor }) });
          onMarkerChangeFn(lineNum, newColor);
          _lastColor = newColor;

          // Start drag — paint same color across dragged lines
          _dragging  = true;
          _dragColor = newColor;

          const onMove = (e) => {
            if (!_dragging) return;
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos == null) return;
            const dl = view.state.doc.lineAt(pos).number;
            if (view.state.field(markerField).get(dl) !== _dragColor) {
              view.dispatch({ effects: setMarkerEffect.of({ line: dl, color: _dragColor }) });
              onMarkerChangeFn(dl, _dragColor);
            }
          };
          const onUp = () => {
            _dragging  = false;
            _dragColor = null;
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

// ═══════════════════════════════════════════════════════════════════════
// TAG MENU COMPONENT
// ═══════════════════════════════════════════════════════════════════════
const QUICK_EMOJIS = ['⭐','🔴','🟡','🟢','🔵','🟣','⚠️','✅','❌','🔑','💡','📌','🔒','⚙️','💻','🌐'];

function TagMenu({ color, x, y, currentTag, onSave, onClose }) {
  const [emoji, setEmoji] = useState(currentTag?.emoji || '');
  const [text,  setText]  = useState(currentTag?.text  || '');

  // Keep menu inside viewport
  const menuX = Math.min(x, window.innerWidth  - 280);
  const menuY = Math.min(y, window.innerHeight - 260);

  return (
    <div className="tag-menu-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tag-menu" style={{ left: menuX, top: menuY }}>
        <div className="tag-menu-header">
          <div className="tag-menu-dot" style={{ background: color }} />
          <span>Tag all <strong style={{color}}>●</strong> markers</span>
          <button className="tag-menu-close" onClick={onClose}>✕</button>
        </div>
        <div className="tag-menu-emoji-row">
          {QUICK_EMOJIS.map(e => (
            <button key={e} className={`tag-emoji-btn ${emoji===e?'sel':''}`} onClick={() => setEmoji(e===emoji?'':e)}>{e}</button>
          ))}
        </div>
        <div className="tag-menu-field">
          <label>Custom emoji</label>
          <input
            className="tag-menu-input"
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            placeholder="Paste any emoji…"
            maxLength={4}
          />
        </div>
        <div className="tag-menu-field">
          <label>Label text (shown as tooltip)</label>
          <input
            className="tag-menu-input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="e.g. 'Review this', 'TODO'…"
            maxLength={60}
            autoFocus
          />
        </div>
        <div className="tag-menu-footer">
          <button className="tag-menu-clear" onClick={() => onSave(color, null)}>✕ Clear tag</button>
          <button className="tag-menu-save"  onClick={() => onSave(color, { emoji, text })}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LANGUAGE DETECTION
// ═══════════════════════════════════════════════════════════════════════
function detectLanguage(content = '', title = '') {
  const t = title.toLowerCase();
  const c = (content || '').slice(0, 600).toLowerCase();
  if (t.endsWith('.sql') || /\b(select\s+\w|insert\s+into|update\s+\w|delete\s+from|create\s+table)\b/.test(c)) return sql();
  if (t.endsWith('.json') || (c.trimStart().startsWith('{') && c.includes('"'))) return json();
  if (t.endsWith('.py')   || /\b(def |import |print\(|class )\b/.test(c)) return python();
  if (t.endsWith('.js') || t.endsWith('.jsx') || t.endsWith('.ts') || /\b(function |const |let |=>)\b/.test(c)) return javascript();
  if (t.endsWith('.yml')  || t.endsWith('.yaml') || /^\w[\w-]+:\s/m.test(c)) return yaml();
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// LOCAL AUTO-PRETTIFY (no AI needed)
// ═══════════════════════════════════════════════════════════════════════
function formatSQL(sql) {
  const keywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|DROP TABLE|ALTER TABLE|WITH|AS|AND|OR|NOT IN|IN)\b/gi;
  return sql
    .replace(/\s+/g, ' ').trim()
    .replace(keywords, '\n$1')
    .split('\n')
    .map((l, i) => (i === 0 ? l.trim() : '  ' + l.trim()))
    .filter(Boolean)
    .join('\n');
}

function localPrettify(text) {
  if (!text.trim()) return text;
  const lines  = text.split('\n');
  const out    = [];
  let i        = 0;
  let lastBlank = false;

  const divider = (title) => {
    const t   = title.trim().toUpperCase();
    const pad = '═'.repeat(Math.max(2, 56 - t.length));
    out.push('');
    out.push(`══════════ ${t} ${pad}`);
    out.push('');
  };

  const pushBlock = (lang, blockLines) => {
    out.push('```' + lang);
    blockLines.forEach(l => out.push(l));
    out.push('```');
  };

  while (i < lines.length) {
    const raw     = lines[i];
    const trimmed = raw.trim();

    // Blank line compression
    if (!trimmed) {
      if (!lastBlank && out.length > 0) { out.push(''); lastBlank = true; }
      i++; continue;
    }
    lastBlank = false;

    // Section divider: ----TITLE---- or ====TITLE====
    const divMatch = trimmed.match(/^[-=*]{4,}\s*(.+?)\s*[-=*]{4,}$/) ||
                     trimmed.match(/^[-=*]{20,}$/) ;
    if (divMatch) {
      divider(divMatch[1] || 'SECTION');
      i++; continue;
    }

    // SQL block detection
    if (/^\s*(SELECT|INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW|DATABASE)|DROP\s+(TABLE|DATABASE)|ALTER\s+TABLE|WITH\s+\w+\s+AS)\b/i.test(trimmed)) {
      const sql = [];
      while (i < lines.length) {
        sql.push(lines[i]);
        const t = lines[i].trim();
        if (t.endsWith(';')) { i++; break; }
        if (!t && sql.length > 1) break;
        i++;
      }
      pushBlock('sql', [formatSQL(sql.join(' '))]);
      continue;
    }

    // Wireshark / RADIUS / network filter
    if (/^(radius|tcp|udp|ip\.|http|dns|eth\.|frame\.|icmp|ssl|tls)\.\w+/.test(trimmed)) {
      const filters = [];
      while (i < lines.length && lines[i].trim() && !/^[-=]/.test(lines[i].trim())) {
        filters.push(lines[i].trim());
        i++;
      }
      pushBlock('wireshark', filters);
      continue;
    }

    // Shell/CLI commands
    if (/^(\$\s|#\s|sudo |ssh |scp |curl |wget |docker |kubectl |git |npm |pip |apt |yum |systemctl |grep |awk |sed |cat |ls |chmod |chown |ps |netstat |ss |ip |ping |traceroute )/.test(trimmed)) {
      const cmds = [];
      while (i < lines.length && lines[i].trim() && !/^[-=]/.test(lines[i].trim())) {
        cmds.push(lines[i].trim());
        i++;
      }
      pushBlock('bash', cmds);
      continue;
    }

    // Credential-like lines — normalize to KEY = VALUE
    if (/^(username|password|user|pass|host|url|port|token|api[_-]?key|secret|db_|database)[_\s\w]*\s*[=:]/i.test(trimmed)) {
      const norm = trimmed.replace(/\s*[:=]\s*/, ' = ');
      out.push(norm);
      i++; continue;
    }

    out.push(raw);
    i++;
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ═══════════════════════════════════════════════════════════════════════
// COMPARTMENTS
// ═══════════════════════════════════════════════════════════════════════
const langCompartment     = new Compartment();
const wrapCompartment     = new Compartment();
const fontSizeCompartment = new Compartment();

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function CodeEditor() {
  const { activeTab, updateTabContent, settings } = useApp();

  const containerRef = useRef(null);
  const viewRef      = useRef(null);
  const currentTabId = useRef(null);
  const suppressSync = useRef(false);
  const updateTabRef = useRef(updateTabContent);
  const activeTabRef = useRef(activeTab);

  const [fontSize,   setFontSize]   = useState(settings.fontSize || 14);
  const [wordWrap,   setWordWrap]   = useState(settings.wordWrap  || false);
  const [showWS,     setShowWS]     = useState(false);
  const [showFind,   setShowFind]   = useState(false);
  const [cursorInfo, setCursorInfo] = useState({ line:1, col:1, sel:0, lines:0 });
  const [tagMenu,    setTagMenu]    = useState(null); // {color, x, y, currentTag}

  useEffect(() => { updateTabRef.current = updateTabContent; }, [updateTabContent]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Hook up the tag menu opener to the module-level pointer
  useEffect(() => {
    _openTagMenu = (color, x, y) => {
      const tags = viewRef.current?.state.field(tagField);
      setTagMenu({ color, x, y, currentTag: tags?.get(color) || null });
    };
    return () => { _openTagMenu = null; };
  }, []);

  // ── Create EditorView once (always, unconditionally) ──────────────────
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const onMarkerChange = (lineNum, color) => {
      const tab = activeTabRef.current;
      if (tab?.document_id) {
        window.vault.marker.set({ docId: tab.document_id, line: lineNum, color: color || null });
      }
    };

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
            ...defaultKeymap, ...historyKeymap, ...searchKeymap,
            ...completionKeymap, ...closeBracketsKeymap, ...foldKeymap,
            indentWithTab,
            { key: 'Alt-ArrowUp',  run: moveLineUp  },
            { key: 'Alt-ArrowDown',run: moveLineDown },
            { key: 'Ctrl-Shift-k', run: deleteLine   },
            { key: 'Ctrl-d',       run: copyLineDown  },
          ]),
          oneDark,
          EditorView.theme({
            '&':                { height: '100%', background: '#0d0d0f' },
            '.cm-content':      {
              fontFamily: settings.fontFamily || "'JetBrains Mono', Consolas, monospace",
              caretColor: '#a78bfa',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            },
            '.cm-scroller':     { overflow: 'auto' },
            // ── Gutters ──
            '.cm-gutters':      { background: '#111118', borderRight: '1px solid #2a2a40', color: '#5a5a78', userSelect: 'none' },
            '.cm-lineNumbers':  { minWidth: '40px' },
            '.cm-lineNumbers .cm-gutterElement': {
              color: '#6a6a88', padding: '0 8px 0 4px', textAlign: 'right', fontSize: '12px',
            },
            '.cm-marker-gutter': {
              width: '20px', background: '#0d0d14', borderRight: '1px solid #1e1e2e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            },
            '.cm-foldGutter .cm-gutterElement': { color: '#5a5a78', cursor: 'pointer', padding: '0 2px' },
            // ── Editor states ──
            '.cm-activeLine':   { background: '#1a1a2e' },
            '.cm-activeLineGutter': { background: '#161625' },
            '.cm-selectionBackground': { background: '#312e8180 !important' },
            '.cm-focused .cm-selectionBackground': { background: '#4c1d9580 !important' },
            '.cm-cursor':       { borderLeftColor: '#a78bfa', borderLeftWidth: '2px' },
            // ── Search ──
            '.cm-searchMatch':  { background: '#f59e0b30', outline: '1px solid #f59e0b60' },
            '.cm-searchMatch.cm-searchMatch-selected': { background: '#f59e0b70' },
            // ── Gutter hover dots ──
            '.cm-marker-gutter:hover .cm-dot-empty': { borderColor: '#5a5a78 !important' },
          }),
          langCompartment.of([]),
          wrapCompartment.of([]),
          fontSizeCompartment.of(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !suppressSync.current) {
              updateTabRef.current(currentTabId.current, update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
              const s    = update.state;
              const main = s.selection.main;
              const ln   = s.doc.lineAt(main.head);
              setCursorInfo({ line: ln.number, col: main.head - ln.from + 1, sel: Math.abs(main.to - main.from), lines: s.doc.lines });
            }
          }),
        ]
      }),
      parent: containerRef.current
    });

    viewRef.current = view;
    return () => { viewRef.current?.destroy(); viewRef.current = null; };
  }, []); // eslint-disable-line

  // ── Load content + markers when tab changes ───────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeTab) return;
    if (currentTabId.current === activeTab.id) return;

    currentTabId.current = activeTab.id;
    suppressSync.current = true;

    const content = activeTab.content || '';
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      effects: [
        langCompartment.reconfigure(detectLanguage(content, activeTab.title) || []),
        wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        fontSizeCompartment.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
      ]
    });

    // Clear all markers
    const existing = view.state.field(markerField);
    for (const line of existing.keys()) {
      view.dispatch({ effects: setMarkerEffect.of({ line, color: null }) });
    }
    // Clear all tags
    const existingTags = view.state.field(tagField);
    for (const color of existingTags.keys()) {
      view.dispatch({ effects: setTagEffect.of({ color, tag: null }) });
    }

    // Load markers from DB
    if (activeTab.document_id) {
      window.vault.marker.get(activeTab.document_id).then(markers => {
        if (!markers) return;
        for (const m of markers) {
          if (m.line_number <= view.state.doc.lines) {
            view.dispatch({ effects: setMarkerEffect.of({ line: m.line_number, color: m.color }) });
          }
        }
      });
      // Load tags from DB
      window.vault.marker.getTags?.(activeTab.document_id).then(tags => {
        if (!tags) return;
        for (const [color, tag] of Object.entries(tags)) {
          view.dispatch({ effects: setTagEffect.of({ color, tag }) });
        }
      });
    }

    setTimeout(() => { suppressSync.current = false; }, 50);
    view.focus();
  }, [activeTab?.id]); // eslint-disable-line

  // ── Tag menu save handler ─────────────────────────────────────────────
  const handleSaveTag = useCallback((color, tag) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setTagEffect.of({ color, tag: tag?.emoji || tag?.text ? tag : null }) });
    setTagMenu(null);
    // Persist to DB
    const tab = activeTabRef.current;
    if (tab?.document_id) {
      const allTags = {};
      const tagMap = view.state.field(tagField);
      tagMap.forEach((v, k) => { allTags[k] = v; });
      if (tag?.emoji || tag?.text) allTags[color] = tag;
      else delete allTags[color];
      window.vault.marker.saveTags?.({ docId: tab.document_id, tags: allTags });
    }
  }, []);

  // ── Editor commands ───────────────────────────────────────────────────
  const toggleWordWrap = useCallback(() => {
    setWordWrap(p => {
      const n = !p;
      viewRef.current?.dispatch({ effects: wrapCompartment.reconfigure(n ? EditorView.lineWrapping : []) });
      return n;
    });
  }, []);

  const zoomIn = useCallback(() => {
    setFontSize(f => {
      const n = Math.min(f + 1, 28);
      viewRef.current?.dispatch({ effects: fontSizeCompartment.reconfigure(EditorView.theme({ '&': { fontSize: `${n}px` } })) });
      return n;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setFontSize(f => {
      const n = Math.max(f - 1, 9);
      viewRef.current?.dispatch({ effects: fontSizeCompartment.reconfigure(EditorView.theme({ '&': { fontSize: `${n}px` } })) });
      return n;
    });
  }, []);

  const foldAll   = useCallback(() => { if (viewRef.current) cmFoldAll(viewRef.current);   }, []);
  const unfoldAll = useCallback(() => { if (viewRef.current) cmUnfoldAll(viewRef.current); }, []);

  const toggleFind = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (showFind) { closeSearchPanel(view); setShowFind(false); }
    else          { openSearchPanel(view);  setShowFind(true);  }
  }, [showFind]);

  // ── Local prettify (no AI) ────────────────────────────────────────────
  const handleLocalPrettify = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const content = view.state.doc.toString();
    if (!content.trim()) return;
    const prettified = localPrettify(content);
    if (prettified === content) return; // nothing changed
    suppressSync.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: prettified } });
    updateTabRef.current(currentTabId.current, prettified);
    setTimeout(() => { suppressSync.current = false; }, 100);
  }, []);

  // ── AI prettify ───────────────────────────────────────────────────────
  const handleAIPrettify = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !activeTabRef.current) return;
    const content = view.state.doc.toString();
    if (!content.trim()) { alert('Nothing to prettify — editor is empty'); return; }

    const s = await window.vault.settings.get();
    const useGem = s.defaultAI === 'gemini';
    const apiKey = useGem ? s.geminiApiKey : s.deepseekApiKey;
    if (!apiKey) { alert(`No API key set. Go to Settings → AI and add your ${useGem ? 'Gemini' : 'DeepSeek'} API key.`); return; }

    const system = `You are a technical documentation formatter. Organize and restructure pasted content.
Rules:
- Add section dividers: ══════════ SECTION TITLE ════════════════════
- Wrap SQL/bash/configs in fenced code blocks with correct language tags
- Format SQL with 2-space indentation
- Add 1-line comment above each block describing what it does
- Normalize credentials to KEY = VALUE format, label current vs retired
- Keep ALL original content — only organize and format
- Return ONLY the formatted content, no explanation`;

    let result;
    if (useGem) result = await window.vault.ai.gemini({ apiKey, model: s.geminiModel || 'gemini-2.0-flash', messages: [{ role:'user', content: `Format this:\n\n${content}` }], system });
    else        result = await window.vault.ai.deepseek({ apiKey, model: s.deepseekModel || 'deepseek-chat', messages: [{ role:'user', content: `Format this:\n\n${content}` }], system });

    if (result.ok) {
      suppressSync.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.text } });
      updateTabRef.current(activeTabRef.current.id, result.text);
      setTimeout(() => { suppressSync.current = false; }, 100);
    } else {
      alert('AI error: ' + result.error);
    }
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
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

  return (
    <div className="code-editor-wrap">
      <Toolbar
        onLocalPrettify={handleLocalPrettify}
        onAIPrettify={handleAIPrettify}
        onToggleFind={toggleFind}
        onToggleWordWrap={toggleWordWrap}
        wordWrap={wordWrap}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFoldAll={foldAll}
        onUnfoldAll={unfoldAll}
        onToggleWhitespace={() => setShowWS(p => !p)}
        showWhitespace={showWS}
        hasActiveTab={!noTab}
      />

      <div className="editor-body">
        <div
          ref={containerRef}
          className="cm-container"
          style={{ position:'absolute', inset:0, visibility: noTab ? 'hidden' : 'visible' }}
        />
        {noTab && (
          <div className="editor-empty">
            <div className="editor-empty-icon">⬡</div>
            <div className="editor-empty-text">Open a document or create a scratch pad</div>
          </div>
        )}
      </div>

      <StatusBar cursorInfo={cursorInfo} fontSize={fontSize} />

      {tagMenu && (
        <TagMenu
          color={tagMenu.color}
          x={tagMenu.x}
          y={tagMenu.y}
          currentTag={tagMenu.currentTag}
          onSave={handleSaveTag}
          onClose={() => setTagMenu(null)}
        />
      )}
    </div>
  );
}
