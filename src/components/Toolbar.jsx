import React, { useState } from 'react';

const TYPES = [
  { key:'note',        label:'NOTE',        color:'#a78bfa' },
  { key:'credentials', label:'CREDS',       color:'#fbbf24' },
  { key:'config',      label:'CONFIG',      color:'#60a5fa' },
  { key:'commands',    label:'COMMANDS',    color:'#4ade80' },
  { key:'mixed',       label:'MIXED',       color:'#f472b6' },
];

export default function Toolbar({
  onLocalPrettify, onAIPrettify,
  onToggleFind, onToggleWordWrap, wordWrap,
  onZoomIn, onZoomOut, onFoldAll, onUnfoldAll,
  onToggleWhitespace, showWhitespace, hasActiveTab
}) {
  const [aiLoading, setAiLoading] = useState(false);

  const handleAI = async () => {
    if (aiLoading || !hasActiveTab) return;
    setAiLoading(true);
    try { await onAIPrettify?.(); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="toolbar">
      {/* Entry type tags */}
      <div className="toolbar-types">
        {TYPES.map(t => (
          <button key={t.key} className="type-tag" style={{ '--tag-color': t.color }} title={`Tag as ${t.label}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      {/* Local format — no AI */}
      <button
        className="toolbar-btn format-btn"
        onClick={onLocalPrettify}
        disabled={!hasActiveTab}
        title="Auto-format document (no AI) — detects SQL, bash, credentials, Wireshark filters"
      >
        ⚡ Format
      </button>

      {/* AI prettify */}
      <button
        className="toolbar-btn prettify-btn"
        onClick={handleAI}
        disabled={aiLoading || !hasActiveTab}
        title="Organize with AI (Gemini / DeepSeek — needs API key in Settings)"
      >
        <span className={aiLoading ? 'spin' : ''}>✦</span>
        {aiLoading ? 'Working…' : 'AI Prettify'}
      </button>

      <div className="toolbar-sep" />

      <button className="toolbar-btn" onClick={onToggleFind}   disabled={!hasActiveTab} title="Find & Replace (Ctrl+F)">⌕ Find</button>
      <button className="toolbar-btn" onClick={onFoldAll}      disabled={!hasActiveTab} title="Fold all">⊟ Fold</button>
      <button className="toolbar-btn" onClick={onUnfoldAll}    disabled={!hasActiveTab} title="Unfold all">⊞ Unfold</button>
      <button className={`toolbar-btn ${wordWrap ? 'active' : ''}`}       onClick={onToggleWordWrap}   disabled={!hasActiveTab} title="Word wrap">⏎ Wrap</button>
      <button className={`toolbar-btn ${showWhitespace ? 'active' : ''}`} onClick={onToggleWhitespace} disabled={!hasActiveTab} title="Show whitespace">· WS</button>

      <div className="toolbar-sep" />

      <button className="toolbar-btn" onClick={onZoomOut} title="Zoom out (Ctrl+-)">－</button>
      <button className="toolbar-btn" onClick={onZoomIn}  title="Zoom in (Ctrl+=)">＋</button>
    </div>
  );
}
