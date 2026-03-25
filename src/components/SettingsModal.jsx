import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const TABS = ['Editor', 'AI', 'Security', 'Appearance'];

export default function SettingsModal({ onClose }) {
  const { settings, saveSettings } = useApp();
  const [local,    setLocal]    = useState({ ...settings });
  const [tab,      setTab]      = useState('Editor');
  const [saved,    setSaved]    = useState(false);
  const [oldPwd,   setOldPwd]   = useState('');
  const [newPwd,   setNewPwd]   = useState('');
  const [cfmPwd,   setCfmPwd]   = useState('');
  const [pwdMsg,   setPwdMsg]   = useState('');
  const [showKeys, setShowKeys] = useState({});

  const set = (key, val) => setLocal(p => ({ ...p, [key]: val }));

  const handleSave = async () => {
    await saveSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) { setPwdMsg('Fill in all fields'); return; }
    if (newPwd.length < 8)  { setPwdMsg('New password must be 8+ chars'); return; }
    if (newPwd !== cfmPwd)  { setPwdMsg('Passwords do not match'); return; }
    setPwdMsg('Changing password…');
    const r = await window.vault.auth.change(oldPwd, newPwd);
    if (r.success) { setPwdMsg('✓ Password changed successfully'); setOldPwd(''); setNewPwd(''); setCfmPwd(''); }
    else            { setPwdMsg('✗ ' + r.error); }
  };

  const toggleShowKey = (k) => setShowKeys(p => ({ ...p, [k]: !p[k] }));

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal settings-modal">
        <div className="modal-header">
          <div className="modal-title">⚙ Settings</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* Sidebar tabs */}
          <div className="settings-nav">
            {TABS.map(t => (
              <button key={t} className={`settings-nav-item ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t}</button>
            ))}
          </div>

          <div className="settings-content">
            {/* ── EDITOR ── */}
            {tab === 'Editor' && (
              <div className="settings-group">
                <h3 className="settings-h">Editor</h3>

                <Row label="Font size">
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input type="range" min={9} max={28} value={local.fontSize||14} onChange={e=>set('fontSize',+e.target.value)} style={{flex:1}} />
                    <span className="settings-val">{local.fontSize||14}px</span>
                  </div>
                </Row>

                <Row label="Font family">
                  <select className="settings-select" value={local.fontFamily||''} onChange={e=>set('fontFamily',e.target.value)}>
                    <option value="'JetBrains Mono', Consolas, monospace">JetBrains Mono</option>
                    <option value="'Fira Code', monospace">Fira Code</option>
                    <option value="'Cascadia Code', monospace">Cascadia Code</option>
                    <option value="Consolas, monospace">Consolas</option>
                    <option value="'Courier New', monospace">Courier New</option>
                    <option value="monospace">System monospace</option>
                  </select>
                </Row>

                <Row label="Tab size">
                  <select className="settings-select" value={local.tabSize||2} onChange={e=>set('tabSize',+e.target.value)}>
                    <option value={2}>2 spaces</option>
                    <option value={4}>4 spaces</option>
                    <option value={8}>8 spaces</option>
                  </select>
                </Row>

                <Row label="Word wrap">
                  <Toggle checked={!!local.wordWrap} onChange={v=>set('wordWrap',v)} />
                </Row>

                <Row label="Auto-save">
                  <Toggle checked={local.autoSave!==false} onChange={v=>set('autoSave',v)} />
                </Row>

                <Row label="Highlight active line">
                  <Toggle checked={!!local.highlightCurrentLine} onChange={v=>set('highlightCurrentLine',v)} />
                </Row>

                <Row label="Bracket matching">
                  <Toggle checked={!!local.bracketMatching} onChange={v=>set('bracketMatching',v)} />
                </Row>

                <Row label="Auto-close brackets">
                  <Toggle checked={!!local.autoCloseBrackets} onChange={v=>set('autoCloseBrackets',v)} />
                </Row>
              </div>
            )}

            {/* ── AI ── */}
            {tab === 'AI' && (
              <div className="settings-group">
                <h3 className="settings-h">AI Provider</h3>

                <Row label="Default AI">
                  <div className="settings-radio-row">
                    {['gemini','deepseek'].map(p=>(
                      <label key={p} className="settings-radio">
                        <input type="radio" name="defaultAI" checked={local.defaultAI===p} onChange={()=>set('defaultAI',p)} />
                        {p==='gemini'?'Google Gemini':'DeepSeek'}
                      </label>
                    ))}
                  </div>
                </Row>

                <h3 className="settings-h" style={{marginTop:20}}>Gemini</h3>

                <Row label="Gemini API key">
                  <div className="settings-key-row">
                    <input
                      type={showKeys.gemini ? 'text' : 'password'}
                      className="settings-input"
                      value={local.geminiApiKey||''}
                      onChange={e=>set('geminiApiKey',e.target.value)}
                      placeholder="AIza…"
                    />
                    <button className="settings-eye" onClick={()=>toggleShowKey('gemini')}>{showKeys.gemini?'🙈':'👁'}</button>
                  </div>
                  <span className="settings-hint"><a href="https://aistudio.google.com/" target="_blank" className="settings-link">Get API key →</a></span>
                </Row>

                <Row label="Gemini model">
                  <select className="settings-select" value={local.geminiModel||'gemini-1.5-pro'} onChange={e=>set('geminiModel',e.target.value)}>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (fast)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (smart)</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  </select>
                </Row>

                <h3 className="settings-h" style={{marginTop:20}}>DeepSeek</h3>

                <Row label="DeepSeek API key">
                  <div className="settings-key-row">
                    <input
                      type={showKeys.deepseek ? 'text' : 'password'}
                      className="settings-input"
                      value={local.deepseekApiKey||''}
                      onChange={e=>set('deepseekApiKey',e.target.value)}
                      placeholder="sk-…"
                    />
                    <button className="settings-eye" onClick={()=>toggleShowKey('deepseek')}>{showKeys.deepseek?'🙈':'👁'}</button>
                  </div>
                  <span className="settings-hint"><a href="https://platform.deepseek.com/" target="_blank" className="settings-link">Get API key →</a></span>
                </Row>

                <Row label="DeepSeek model">
                  <select className="settings-select" value={local.deepseekModel||'deepseek-chat'} onChange={e=>set('deepseekModel',e.target.value)}>
                    <option value="deepseek-chat">DeepSeek Chat (V3)</option>
                    <option value="deepseek-reasoner">DeepSeek Reasoner (R1)</option>
                  </select>
                </Row>

                <h3 className="settings-h" style={{marginTop:20}}>Auto-Prettify</h3>
                <Row label="Auto-prettify on paste">
                  <Toggle checked={!!local.autoPrettify} onChange={v=>set('autoPrettify',v)} />
                </Row>
                <Row label="Custom prettify instructions">
                  <textarea
                    className="settings-textarea"
                    value={local.prettifyPrompt||''}
                    onChange={e=>set('prettifyPrompt',e.target.value)}
                    placeholder="Additional instructions for the AI when organizing content…"
                    rows={4}
                  />
                </Row>
              </div>
            )}

            {/* ── SECURITY ── */}
            {tab === 'Security' && (
              <div className="settings-group">
                <h3 className="settings-h">Change Master Password</h3>
                <p className="settings-desc">Changing your password re-encrypts your entire vault. This may take a moment for large vaults.</p>

                <Row label="Current password">
                  <input type="password" className="settings-input" value={oldPwd} onChange={e=>setOldPwd(e.target.value)} placeholder="Current password" />
                </Row>
                <Row label="New password">
                  <input type="password" className="settings-input" value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="New password (8+ chars)" />
                </Row>
                <Row label="Confirm new">
                  <input type="password" className="settings-input" value={cfmPwd} onChange={e=>setCfmPwd(e.target.value)} placeholder="Repeat new password" />
                </Row>

                {pwdMsg && <div className={`settings-msg ${pwdMsg.startsWith('✓')?'ok':'err'}`}>{pwdMsg}</div>}

                <button className="settings-pwd-btn" onClick={handleChangePwd}>Change Password</button>

                <h3 className="settings-h" style={{marginTop:24}}>Encryption Info</h3>
                <div className="settings-enc-info">
                  <div className="enc-row"><span>Algorithm</span><code>AES-256-GCM</code></div>
                  <div className="enc-row"><span>Key derivation</span><code>PBKDF2-SHA256 (310,000 iterations)</code></div>
                  <div className="enc-row"><span>Storage</span><code>SQLite (local only)</code></div>
                  <div className="enc-row"><span>Scope</span><code>All document content + tab content</code></div>
                </div>
              </div>
            )}

            {/* ── APPEARANCE ── */}
            {tab === 'Appearance' && (
              <div className="settings-group">
                <h3 className="settings-h">Theme</h3>
                <Row label="Color theme">
                  <select className="settings-select" value={local.theme||'dark'} onChange={e=>set('theme',e.target.value)}>
                    <option value="dark">Dark (default)</option>
                    <option value="darker">Darker</option>
                    <option value="monokai">Monokai</option>
                  </select>
                </Row>
                <Row label="Sidebar width">
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input type="range" min={160} max={320} step={10} value={local.sidebarWidth||220} onChange={e=>set('sidebarWidth',+e.target.value)} style={{flex:1}} />
                    <span className="settings-val">{local.sidebarWidth||220}px</span>
                  </div>
                </Row>
                <Row label="Right panel width">
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input type="range" min={220} max={420} step={10} value={local.rightPanelWidth||300} onChange={e=>set('rightPanelWidth',+e.target.value)} style={{flex:1}} />
                    <span className="settings-val">{local.rightPanelWidth||300}px</span>
                  </div>
                </Row>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-save" onClick={handleSave}>
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="settings-row">
      <label className="settings-label">{label}</label>
      <div className="settings-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <div className={`toggle ${checked?'on':''}`} onClick={() => onChange(!checked)}>
      <div className="toggle-thumb" />
    </div>
  );
}
