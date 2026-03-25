import React, { useState, useEffect, useRef } from 'react';

export default function LoginScreen({ mode, onSuccess }) {
  const [pwd,     setPwd]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [show,    setShow]    = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!pwd.trim()) { setError('Password is required'); return; }
    if (mode === 'setup') {
      if (pwd.length < 8)          { setError('Password must be at least 8 characters'); return; }
      if (pwd !== confirm)          { setError('Passwords do not match'); return; }
    }
    setLoading(true);
    try {
      const ok = mode === 'setup'
        ? await window.vault.auth.set(pwd)
        : await window.vault.auth.verify(pwd);
      if (ok) { onSuccess(); }
      else    { setError('Incorrect password'); setPwd(''); }
    } finally { setLoading(false); }
  };

  return (
    <div className="login-root">
      <div className="login-bg">
        {[...Array(12)].map((_, i) => (
          <div key={i} className={`login-orb orb-${i}`} />
        ))}
      </div>

      <div className="login-card">
        <div className="login-logo">
          <div className="login-icon-ring">
            <span className="login-icon-glyph">⬡</span>
            <span className="login-icon-lock">🔐</span>
          </div>
          <h1 className="login-title">DevVault</h1>
          <p className="login-sub">
            {mode === 'setup' ? 'Create your master password' : 'Enter your master password'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label className="login-label">
              {mode === 'setup' ? 'New Master Password' : 'Master Password'}
            </label>
            <div className="login-input-wrap">
              <input
                ref={inputRef}
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                className="login-input"
                placeholder={mode === 'setup' ? 'Choose a strong password…' : 'Enter password…'}
                autoComplete="off"
              />
              <button type="button" className="login-eye" onClick={() => setShow(!show)}>
                {show ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {mode === 'setup' && (
            <div className="login-field">
              <label className="login-label">Confirm Password</label>
              <div className="login-input-wrap">
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="login-input"
                  placeholder="Repeat password…"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {error && <div className="login-error">⚠ {error}</div>}

          {mode === 'setup' && (
            <div className="login-notice">
              <span className="login-notice-icon">⚠</span>
              Your password encrypts all stored data with AES-256-GCM. It cannot be recovered if lost.
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <span className="login-spinner" /> : null}
            {mode === 'setup' ? 'Create Vault' : 'Unlock Vault'}
          </button>
        </form>

        {mode === 'setup' && (
          <div className="login-strength">
            <div className="login-strength-label">Password strength</div>
            <div className="login-strength-bar">
              {[0,1,2,3].map(i => (
                <div key={i} className={`login-strength-seg ${getStrength(pwd) > i ? `seg-${getStrength(pwd)}` : ''}`} />
              ))}
            </div>
            <div className="login-strength-text">{['', 'Weak', 'Fair', 'Good', 'Strong'][getStrength(pwd)]}</div>
          </div>
        )}
      </div>

      <div className="login-footer">
        All data stored locally · AES-256-GCM encrypted · Zero cloud
      </div>
    </div>
  );
}

function getStrength(pwd) {
  if (!pwd) return 0;
  let s = 0;
  if (pwd.length >= 8)  s++;
  if (pwd.length >= 12) s++;
  if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return Math.min(s, 4);
}
