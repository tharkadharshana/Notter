import React, { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';

export default function SearchPanel() {
  const { openDocInTab } = useApp();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  const search = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const r = await window.vault.search.all(q.trim());
    setResults(r);
    setLoading(false);
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q), 300);
  };

  const TYPE_COLORS = { credentials:'#fbbf24', config:'#60a5fa', commands:'#4ade80', note:'#a78bfa', mixed:'#f472b6' };
  const TYPE_ICONS  = { credentials:'🔑', config:'⚙️', commands:'💻', note:'📝', mixed:'🗂' };

  const highlight = (text, q) => {
    if (!q || !text) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>{text.slice(0,idx)}<mark className="search-hl">{text.slice(idx,idx+q.length)}</mark>{text.slice(idx+q.length)}</>
    );
  };

  return (
    <div className="search-panel">
      <div className="search-input-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          placeholder="Search all documents…"
          value={query}
          onChange={handleChange}
          autoFocus
        />
        {loading && <span className="search-spinner">⟳</span>}
        {query && <button className="search-clear" onClick={()=>{setQuery('');setResults([]);}}>✕</button>}
      </div>

      {results.length === 0 && query.length >= 2 && !loading && (
        <div className="search-empty">No results for "{query}"</div>
      )}

      <div className="search-results">
        {results.map(r => (
          <div key={r.id} className="search-result" onClick={() => openDocInTab(r.id, r.title)}>
            <div className="sr-header">
              <span className="sr-icon">{TYPE_ICONS[r.entryType]||'📄'}</span>
              <span className="sr-title">{highlight(r.title, query)}</span>
              <span className="sr-type" style={{color: TYPE_COLORS[r.entryType]||'#888'}}>
                {r.entryType}
              </span>
            </div>
            <div className="sr-ws" style={{color: r.wsColor}}>{r.wsName}</div>
            {r.matchLine && (
              <div className="sr-match">{highlight(r.matchLine, query)}</div>
            )}
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div className="search-count">{results.length} result{results.length!==1?'s':''}</div>
      )}
    </div>
  );
}
