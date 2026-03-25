import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const TYPES = [
  { key:'note',        label:'NOTE',        color:'#a78bfa' },
  { key:'credentials', label:'CREDENTIALS', color:'#fbbf24' },
  { key:'config',      label:'CONFIG',      color:'#60a5fa' },
  { key:'commands',    label:'COMMANDS',    color:'#4ade80' },
  { key:'mixed',       label:'MIXED',       color:'#f472b6' },
];

export default function Toolbar({ onPrettify, onToggleFind, onToggleWordWrap, wordWrap, onZoomIn, onZoomOut, onFoldAll, onUnfoldAll, onToggleWhitespace, showWhitespace }) {
  const { activeTab, tabs, updateTabContent, settings } = useApp();
  const [prettifying, setPrettifying] = useState(false);

  const tab = activeTab;
  const currentType = tab?.entry_type || 'note';

  const handlePrettify = async () => {
    if (!tab || prettifying) return;
    const key = settings.defaultAI === 'gemini' ? settings.geminiApiKey : settings.deepseekApiKey;
    if (!key) { alert('Please set an AI API key in Settings first'); return; }
    if (!tab.content?.trim()) { alert('Nothing to prettify — editor is empty'); return; }
    setPrettifying(true);
    try {
      await onPrettify();
    } finally { setPrettifying(false); }
  };

  return (
    <div className="toolbar">
      {/* Entry type tags */}
      <div className="toolbar-types">
        {TYPES.map(t => (
          <button
            key={t.key}
            className={`type-tag ${currentType === t.key ? 'active' : ''}`}
            style={{ '--tag-color': t.color }}
            title={`Set type: ${t.label}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      {/* AI Prettify */}
      <button className="toolbar-btn prettify-btn" onClick={handlePrettify} disabled={prettifying} title="Organize with AI">
        {prettifying ? <span className="spin">⟳</span> : '✦'}
        {prettifying ? 'Organizing…' : 'Prettify'}
      </button>

      <div className="toolbar-sep" />

      {/* Editor controls */}
      <button className="toolbar-btn" onClick={onToggleFind}      title="Find & Replace (Ctrl+F)">⌕ Find</button>
      <button className="toolbar-btn" onClick={onFoldAll}         title="Fold all sections">⊟ Fold</button>
      <button className="toolbar-btn" onClick={onUnfoldAll}       title="Unfold all sections">⊞ Unfold</button>
      <button className={`toolbar-btn ${wordWrap?'active':''}`}   onClick={onToggleWordWrap}  title="Toggle word wrap">⏎ Wrap</button>
      <button className={`toolbar-btn ${showWhitespace?'active':''}`} onClick={onToggleWhitespace} title="Show whitespace">· WS</button>

      <div className="toolbar-sep" />

      <button className="toolbar-btn" onClick={onZoomOut} title="Zoom out (Ctrl+-)">－</button>
      <button className="toolbar-btn" onClick={onZoomIn}  title="Zoom in (Ctrl+=)">＋</button>
    </div>
  );
}
