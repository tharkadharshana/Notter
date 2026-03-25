import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import MainLayout  from './components/MainLayout';
import { AppProvider } from './context/AppContext';

export default function App() {
  const [authState, setAuthState] = useState('loading'); // loading | setup | locked | unlocked

  useEffect(() => {
    window.vault.auth.has().then(has => setAuthState(has ? 'locked' : 'setup'));
  }, []);

  if (authState === 'loading') {
    return (
      <div className="boot-screen">
        <div className="boot-logo">
          <span className="boot-icon">🔐</span>
          <span className="boot-name">DevVault</span>
        </div>
      </div>
    );
  }

  if (authState === 'setup' || authState === 'locked') {
    return (
      <LoginScreen
        mode={authState}
        onSuccess={() => setAuthState('unlocked')}
      />
    );
  }

  return (
    <AppProvider>
      <MainLayout onLock={() => { window.vault.auth.logout(); setAuthState('locked'); }} />
    </AppProvider>
  );
}
