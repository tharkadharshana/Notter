import React, { useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function TabBar() {
  const { tabs, activeTabId, setActiveTabId, closeTab, openNewScratch } = useApp();
  const barRef = useRef(null);

  // Keyboard: Ctrl+Tab, Ctrl+W
  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Tab') {
        e.preventDefault();
        const idx  = tabs.findIndex(t => t.id === activeTabId);
        const next = (idx + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length;
        setActiveTabId(tabs[next]?.id);
      }
      if (mod && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs, activeTabId, closeTab, setActiveTabId]);

  // Scroll active tab into view
  useEffect(() => {
    const el = barRef.current?.querySelector('.tab.active');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  // Wheel to scroll tabs
  const onWheel = (e) => {
    if (barRef.current) barRef.current.scrollLeft += e.deltaY;
  };

  const ENTRY_COLORS = { credentials:'#fbbf24', config:'#60a5fa', commands:'#4ade80', note:'#a78bfa', mixed:'#f472b6', scratch:'#6b7280' };

  return (
    <div className="tabbar" ref={barRef} onWheel={onWheel}>
      <div className="tabbar-inner">
        {tabs.map(tab => {
          const isActive  = tab.id === activeTabId;
          const isScratch = !!tab.is_scratch;
          return (
            <div
              key={tab.id}
              className={`tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
              title={tab.title}
            >
              <span
                className="tab-dot"
                style={{ background: ENTRY_COLORS[isScratch ? 'scratch' : 'note'] }}
              />
              <span className="tab-title">{tab.title || 'scratch'}</span>
              {isScratch && <span className="tab-badge">scratch</span>}
              <button
                className="tab-close"
                onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                title="Close (Ctrl+W)"
              >✕</button>
            </div>
          );
        })}
      </div>
      <button className="tab-new" onClick={openNewScratch} title="New scratch pad (Ctrl+N)">＋</button>
    </div>
  );
}
