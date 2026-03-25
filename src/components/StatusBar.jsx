import React from 'react';
import { useApp } from '../context/AppContext';

export default function StatusBar({ cursorInfo, fontSize }) {
  const { activeTab, settings } = useApp();
  const info = cursorInfo || { line:1, col:1, sel:0, lines:0 };

  return (
    <div className="statusbar">
      <div className="sb-left">
        <span className="sb-item">Ln {info.line}</span>
        <span className="sb-sep">│</span>
        <span className="sb-item">Col {info.col}</span>
        {info.sel > 0 && <>
          <span className="sb-sep">│</span>
          <span className="sb-item sb-sel">{info.sel} selected</span>
        </>}
        <span className="sb-sep">│</span>
        <span className="sb-item">{info.lines} lines</span>
      </div>

      <div className="sb-center">
        {activeTab && (
          <span className="sb-autosave">
            <span className="sb-autosave-dot" />
            AUTO-SAVED
          </span>
        )}
      </div>

      <div className="sb-right">
        {fontSize && <span className="sb-item">{fontSize}px</span>}
        <span className="sb-sep">│</span>
        <span className="sb-item">UTF-8</span>
        <span className="sb-sep">│</span>
        <span className="sb-item">LF</span>
        <span className="sb-sep">│</span>
        <span className="sb-item">{settings.tabSize || 2} spaces</span>
        <span className="sb-sep">│</span>
        <span className="sb-item sb-enc">AES-256 🔐</span>
      </div>
    </div>
  );
}
