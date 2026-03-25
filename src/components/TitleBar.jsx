import React from 'react';
import { useApp } from '../context/AppContext';

export default function TitleBar({ onLock }) {
  const { activeTab, setShowSettings } = useApp();

  return (
    <div className="titlebar">
      <div className="titlebar-drag" />

      <div className="titlebar-left">
        <div className="titlebar-logo">
          <span className="titlebar-hex">⬡</span>
          <span className="titlebar-name">DevVault</span>
        </div>
        {activeTab && (
          <span className="titlebar-doc">{activeTab.title}</span>
        )}
      </div>

      <div className="titlebar-center titlebar-drag" />

      <div className="titlebar-right">
        <button className="tb-action" title="Settings (Ctrl+,)" onClick={() => setShowSettings(true)}>⚙</button>
        <button className="tb-action" title="Lock Vault" onClick={onLock}>🔒</button>
        <div className="titlebar-winbtns">
          <button className="winbtn minimize" onClick={() => window.vault.win.min()}  title="Minimize">─</button>
          <button className="winbtn maximize" onClick={() => window.vault.win.max()}  title="Maximize">□</button>
          <button className="winbtn close"    onClick={() => window.vault.win.close()} title="Close">✕</button>
        </div>
      </div>
    </div>
  );
}
