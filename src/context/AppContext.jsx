import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [workspaces,    setWorkspaces]    = useState([]);
  const [activeWsId,    setActiveWsId]    = useState(null);
  const [documents,     setDocuments]     = useState([]);
  const [tabs,          setTabs]          = useState([]);
  const [activeTabId,   setActiveTabId]   = useState(null);
  const [settings,      setSettings]      = useState({});
  const [showSettings,  setShowSettings]  = useState(false);
  const [showSearch,    setShowSearch]    = useState(false);
  const saveTimers = useRef({});

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([window.vault.ws.all(), window.vault.settings.get(), window.vault.tab.all()]).then(([wsList, sett, savedTabs]) => {
      setWorkspaces(wsList);
      setSettings(sett);
      if (wsList.length > 0) {
        setActiveWsId(wsList[0].id);
        loadDocuments(wsList[0].id);
      }
      if (savedTabs.length > 0) {
        setTabs(savedTabs);
        const active = savedTabs.find(t => t.is_active) || savedTabs[savedTabs.length - 1];
        setActiveTabId(active.id);
      } else {
        openNewScratch();
      }
    });
  }, []);

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
    const id = await window.vault.doc.create({ wsId: activeWsId, parentId, title, content: '', entryType, isFolder });
    await loadDocuments(activeWsId);
    return id;
  }, [activeWsId, loadDocuments]);

  const deleteDocument = useCallback(async (id) => {
    await window.vault.doc.delete(id);
    setTabs(prev => prev.filter(t => t.document_id !== id));
    await loadDocuments(activeWsId);
  }, [activeWsId]);

  const renameDocument = useCallback(async (id, title) => {
    await window.vault.doc.update({ id, title });
    await loadDocuments(activeWsId);
    setTabs(prev => prev.map(t => t.document_id === id ? { ...t, title } : t));
  }, [activeWsId]);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const openNewScratch = useCallback(() => {
    const id = crypto.randomUUID();
    const tab = { id, document_id: null, title: 'scratch', content: '', is_scratch: 1, tab_order: 0, is_active: 1 };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(id);
    window.vault.tab.save({ id, title: 'scratch', content: '', isScratch: true, tabOrder: Date.now(), isActive: true });
  }, []);

  const openDocInTab = useCallback(async (docId, title) => {
    const existing = tabs.find(t => t.document_id === docId);
    if (existing) { setActiveTabId(existing.id); return; }
    const doc = await window.vault.doc.get(docId);
    const id  = crypto.randomUUID();
    const tab = { id, document_id: docId, title: title || doc.title, content: doc.content, is_scratch: 0, tab_order: Date.now(), is_active: 1 };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(id);
    window.vault.tab.save({ id, documentId: docId, title: tab.title, content: doc.content, isScratch: false, tabOrder: tab.tab_order, isActive: true });
  }, [tabs]);

  const closeTab = useCallback((tabId) => {
    setTabs(prev => {
      const idx  = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId && next.length > 0) {
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(newActive.id);
      } else if (next.length === 0) {
        setTimeout(openNewScratch, 0);
      }
      return next;
    });
    window.vault.tab.delete(tabId);
  }, [activeTabId, openNewScratch]);

  // ── Content update (debounced auto-save) ──────────────────────────────────
  const updateTabContent = useCallback((tabId, content) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, content } : t));
    // Debounced DB save
    clearTimeout(saveTimers.current[tabId]);
    saveTimers.current[tabId] = setTimeout(() => {
      const tab = tabs.find(t => t.id === tabId) || {};
      window.vault.tab.save({ id: tabId, documentId: tab.document_id || null, title: tab.title || 'scratch', content, isScratch: !tab.document_id, tabOrder: tab.tab_order || 0, isActive: tab.id === activeTabId });
      if (tab.document_id) {
        window.vault.doc.update({ id: tab.document_id, content });
      }
    }, 600);
  }, [tabs, activeTabId]);

  const updateTabTitle = useCallback((tabId, title) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t));
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.document_id) renameDocument(tab.document_id, title);
  }, [tabs, renameDocument]);

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

  const activeTab = tabs.find(t => t.id === activeTabId) || null;

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
