import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import AIPanel    from './AIPanel';
import SearchPanel from './SearchPanel';

export default function RightPanel() {
  const [tab, setTab] = useState('ai');

  return (
    <div className="right-panel">
      <div className="rp-tabs">
        <button className={`rp-tab ${tab==='search'?'active':''}`} onClick={()=>setTab('search')}>⌕ Search</button>
        <button className={`rp-tab ${tab==='ai'?'active':''}`}     onClick={()=>setTab('ai')}>✦ AI</button>
      </div>
      <div className="rp-body">
        {tab === 'search' ? <SearchPanel /> : <AIPanel />}
      </div>
    </div>
  );
}
