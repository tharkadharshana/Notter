import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [workspaces,   setWorkspaces]   = useState([]);
  const [activeWsId,   setActiveWsId]   = useState(null);
  const [documents,    setDocuments]    = useState([]);
  const [tabs,         setTabs]         = useState([]);
  const [activeTabId,  setActiveTabId]  = useState(null);
  const [settings,     setSettings]     = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch,   setShowSearch]   = useState(false);

  const saveTimers   = useRef({});
  // FIX #6: keep a ref to tabs so save timers always see current tabs without stale closure
  const tabsRef      = useRef([]);
  const activeTabRef = useRef(null);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const activeTab = tabs.find(t => t.id === activeTabId) || null;
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      window.vault.ws.all(),
      window.vault.settings.get(),
      window.vault.tab.all()
    ]).then(([wsList, sett, savedTabs]) => {
      setWorkspaces(wsList);
      setSettings(sett);

      if (wsList.length > 0) {
        setActiveWsId(wsList[0].id);
        window.vault.doc.list(wsList[0].id).then(docs => setDocuments(docs));
      }

      if (savedTabs && savedTabs.length > 0) {
        setTabs(savedTabs);
        const active = savedTabs.find(t => t.is_active) || savedTabs[savedTabs.length - 1];
        setActiveTabId(active.id);
      } else {
        // FIX #7: defer scratch creation so DB is ready
        setTimeout(() => _openNewScratch(), 100);
      }
    }).catch(err => {
      console.error('Bootstrap error:', err);
      setTimeout(() => _openNewScratch(), 200);
    });
  }, []); // eslint-disable-line

  // ── Documents ──────────────────────────────────────────────────────────────
  const loadDocuments = useCallback(async (wsId) => {
    const docs = await window.vault.doc.list(wsId);
    setDocuments(docs);
  }, []);

  const selectWorkspace = useCallback((wsId) => {
    setActiveWsId(wsId);
    loadDocuments(wsId);
  }, [loadDocuments]);

  const createDocument = useCallback(async ({ title, entryType = 'note', isFolder = false, parentId = null }) => {
    const wsId = activeWsId;
    const id   = await window.vault.doc.create({ wsId, parentId, title, content: '', entryType, isFolder });
    await loadDocuments(wsId);
    return id;
  }, [activeWsId, loadDocuments]);

  const deleteDocument = useCallback(async (id) => {
    await window.vault.doc.delete(id);
    // Close any open tabs for this doc
    setTabs(prev => {
      const filtered = prev.filter(t => t.document_id !== id);
      // if the deleted doc's tab was active, switch to last tab
      if (prev.find(t => t.document_id === id && t.id === activeTabRef.current?.id)) {
        const last = filtered[filtered.length - 1];
        if (last) setActiveTabId(last.id);
      }
      return filtered;
    });
    const wsId = activeWsId;
    if (wsId) await loadDocuments(wsId);
  }, [activeWsId, loadDocuments]);

  const renameDocument = useCallback(async (id, title) => {
    await window.vault.doc.update({ id, title });
    setTabs(prev => prev.map(t => t.document_id === id ? { ...t, title } : t));
    if (activeWsId) await loadDocuments(activeWsId);
  }, [activeWsId, loadDocuments]);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  function _openNewScratch() {
    const id  = crypto.randomUUID();
    const tab = { id, document_id: null, title: 'scratch', content: '', is_scratch: 1, tab_order: Date.now(), is_active: 1 };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(id);
    try {
      window.vault.tab.save({ id, title: 'scratch', content: '', isScratch: true, tabOrder: tab.tab_order, isActive: true });
    } catch(e) { console.warn('tab save:', e); }
  }

  const openNewScratch = useCallback(() => { _openNewScratch(); }, []); // eslint-disable-line

  const openDocInTab = useCallback(async (docId, title) => {
    // Check if already open using the ref for latest tabs
    const existing = tabsRef.current.find(t => t.document_id === docId);
    if (existing) { setActiveTabId(existing.id); return; }

    const doc = await window.vault.doc.get(docId);
    if (!doc) return;
    const id  = crypto.randomUUID();
    const tab = {
      id, document_id: docId, title: title || doc.title,
      content: doc.content, is_scratch: 0, tab_order: Date.now(), is_active: 1
    };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(id);
    window.vault.tab.save({ id, documentId: docId, title: tab.title, content: doc.content, isScratch: false, tabOrder: tab.tab_order, isActive: true });
  }, []); // eslint-disable-line — uses tabsRef

  const closeTab = useCallback((tabId) => {
    setTabs(prev => {
      const idx  = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabRef.current?.id === tabId) {
        if (next.length > 0) {
          const newActive = next[Math.min(idx, next.length - 1)];
          setActiveTabId(newActive.id);
        } else {
          setActiveTabId(null);
          setTimeout(_openNewScratch, 50);
        }
      }
      return next;
    });
    window.vault.tab.delete(tabId);
  }, []); // eslint-disable-line

  // ── Content update (debounced auto-save) ──────────────────────────────────
  const updateTabContent = useCallback((tabId, content) => {
    if (!tabId) return;
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, content } : t));

    clearTimeout(saveTimers.current[tabId]);
    saveTimers.current[tabId] = setTimeout(() => {
      // FIX #6: use tabsRef.current to get latest tabs — never stale
      const tab = tabsRef.current.find(t => t.id === tabId);
      if (!tab) return;
      window.vault.tab.save({
        id: tabId, documentId: tab.document_id || null,
        title: tab.title || 'scratch', content,
        isScratch: !tab.document_id, tabOrder: tab.tab_order || 0,
        isActive: tab.id === activeTabRef.current?.id
      });
      if (tab.document_id) {
        window.vault.doc.update({ id: tab.document_id, content });
      }
    }, 600);
  }, []); // eslint-disable-line — uses refs only

  const updateTabTitle = useCallback((tabId, title) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t));
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (tab?.document_id) renameDocument(tab.document_id, title);
  }, [renameDocument]);

  // ── Settings ───────────────────────────────────────────────────────────────
  const saveSettings = useCallback(async (s) => {
    await window.vault.settings.save(s);
    setSettings(s);
  }, []);

  // ── Workspaces CRUD ────────────────────────────────────────────────────────
  const createWorkspace = useCallback(async ({ name, color, icon }) => {
    await window.vault.ws.create({ name, color, icon });
    const updated = await window.vault.ws.all();
    setWorkspaces(updated);
  }, []);

  const deleteWorkspace = useCallback(async (id) => {
    await window.vault.ws.delete(id);
    const updated = await window.vault.ws.all();
    setWorkspaces(updated);
    if (activeWsId === id && updated.length > 0) selectWorkspace(updated[0].id);
  }, [activeWsId, selectWorkspace]);

  return (
    <Ctx.Provider value={{
      workspaces, activeWsId, selectWorkspace,
      documents, loadDocuments, createDocument, deleteDocument, renameDocument,
      tabs, activeTabId, activeTab, setActiveTabId,
      openDocInTab, openNewScratch, closeTab,
      updateTabContent, updateTabTitle,
      settings, saveSettings, showSettings, setShowSettings,
      showSearch, setShowSearch,
      createWorkspace, deleteWorkspace,
    }}>
      {children}
    </Ctx.Provider>
  );
}
