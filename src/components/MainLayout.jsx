import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import TitleBar      from './TitleBar';
import Sidebar       from './Sidebar';
import TabBar        from './TabBar';
import CodeEditor    from './CodeEditor';
import RightPanel    from './RightPanel';
import SettingsModal from './SettingsModal';

export default function MainLayout({ onLock }) {
  const { showSettings, setShowSettings, openNewScratch } = useApp();

  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'n') { e.preventDefault(); openNewScratch(); }
      if (mod && e.key === ',') { e.preventDefault(); setShowSettings(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openNewScratch, setShowSettings]);

  return (
    <div className="app-root">
      <TitleBar onLock={onLock} />
      <div className="app-body">
        <Sidebar />
        <div className="app-main">
          <TabBar />
          <div className="editor-and-panel" style={{flex:1, display:'flex', overflow:'hidden', minHeight:0}}>
            <CodeEditor />
            <RightPanel />
          </div>
        </div>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
