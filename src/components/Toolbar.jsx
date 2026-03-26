import React, { useState } from 'react';

const TYPES = [
  { key:'note',        label:'NOTE',        color:'#a78bfa' },
  { key:'credentials', label:'CREDENTIALS', color:'#fbbf24' },
  { key:'config',      label:'CONFIG',      color:'#60a5fa' },
  { key:'commands',    label:'COMMANDS',    color:'#4ade80' },
  { key:'mixed',       label:'MIXED',       color:'#f472b6' },
];

export default function Toolbar({
  onPrettify, onToggleFind, onToggleWordWrap, wordWrap,
  onZoomIn, onZoomOut, onFoldAll, onUnfoldAll,
  onToggleWhitespace, showWhitespace, hasActiveTab
}) {
  const [prettifying, setPrettifying] = useState(false);

  const handlePrettify = async () => {
    if (prettifying || !hasActiveTab) return;
    setPrettifying(true);
    try { await onPrettify?.(); }
    finally { setPrettifying(false); }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-types">
        {TYPES.map(t => (
          <button key={t.key} className="type-tag" style={{ '--tag-color': t.color }} title={`Tag as ${t.label}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      <button
        className="toolbar-btn prettify-btn"
        onClick={handlePrettify}
        disabled={prettifying || !hasActiveTab}
        title="Organize with AI (requires API key in Settings)"
      >
        <span className={prettifying ? 'spin' : ''}>{prettifying ? '⟳' : '✦'}</span>
        {prettifying ? 'Organizing…' : 'Prettify'}
      </button>

      <div className="toolbar-sep" />

      <button className="toolbar-btn" onClick={onToggleFind}       title="Find & Replace (Ctrl+F)">⌕ Find</button>
      <button className="toolbar-btn" onClick={onFoldAll}          title="Fold all sections">⊟ Fold</button>
      <button className="toolbar-btn" onClick={onUnfoldAll}        title="Unfold all">⊞ Unfold</button>
      <button className={`toolbar-btn ${wordWrap ? 'active' : ''}`}       onClick={onToggleWordWrap}    title="Toggle word wrap">⏎ Wrap</button>
      <button className={`toolbar-btn ${showWhitespace ? 'active' : ''}`} onClick={onToggleWhitespace}  title="Show whitespace">· WS</button>

      <div className="toolbar-sep" />

      <button className="toolbar-btn" onClick={onZoomOut} title="Zoom out (Ctrl+-)">－</button>
      <button className="toolbar-btn" onClick={onZoomIn}  title="Zoom in (Ctrl+=)">＋</button>
    </div>
  );
}
