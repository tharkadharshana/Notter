import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const ENTRY_ICONS = { credentials:'🔑', config:'⚙️', commands:'💻', note:'📝', mixed:'🗂' };

export default function Sidebar() {
  const {
    workspaces, activeWsId, selectWorkspace,
    documents, createDocument, deleteDocument, renameDocument,
    openDocInTab, openNewScratch, createWorkspace,
    setShowSettings, setShowSearch
  } = useApp();

  const [expanded,     setExpanded]     = useState({});
  const [editingDoc,   setEditingDoc]   = useState(null);
  const [editTitle,    setEditTitle]    = useState('');
  const [showNewDoc,   setShowNewDoc]   = useState(false);
  const [newDocTitle,  setNewDocTitle]  = useState('');
  const [newDocType,   setNewDocType]   = useState('note');
  const [newDocFolder, setNewDocFolder] = useState(false);
  const [showNewWs,    setShowNewWs]    = useState(false);
  const [newWsName,    setNewWsName]    = useState('');
  const [newWsColor,   setNewWsColor]   = useState('#7C3AED');
  const [ctxMenu,      setCtxMenu]      = useState(null);
  const editRef = useRef(null);

  useEffect(() => { if (editingDoc && editRef.current) editRef.current.focus(); }, [editingDoc]);

  // Close context menu on outside click
  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const startRename = (doc) => {
    setEditingDoc(doc.id);
    setEditTitle(doc.title);
    setCtxMenu(null);
  };

  const commitRename = (id) => {
    if (editTitle.trim()) renameDocument(id, editTitle.trim());
    setEditingDoc(null);
  };

  const handleCreate = async () => {
    if (!newDocTitle.trim()) return;
    const id = await createDocument({ title: newDocTitle.trim(), entryType: newDocType, isFolder: newDocFolder });
    if (!newDocFolder && id) openDocInTab(id, newDocTitle.trim());
    setNewDocTitle('');
    setShowNewDoc(false);
  };

  const handleCreateWs = async () => {
    if (!newWsName.trim()) return;
    
    // call directly
    await window.vault.ws.create({ name: newWsName.trim(), color: newWsColor, icon: '📁' });
    window.location.reload();
  };

  const folders = documents.filter(d => d.is_folder);
  const roots   = documents.filter(d => !d.is_folder && !d.parent_id);
  const inFolder = (fid) => documents.filter(d => !d.is_folder && d.parent_id === fid);

  const renderDoc = (doc) => (
    <div
      key={doc.id}
      className="sidebar-doc"
      onDoubleClick={() => openDocInTab(doc.id, doc.title)}
      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x:e.clientX, y:e.clientY, doc }); }}
    >
      {editingDoc === doc.id ? (
        <input
          ref={editRef}
          className="sidebar-rename"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onBlur={() => commitRename(doc.id)}
          onKeyDown={e => { if (e.key==='Enter') commitRename(doc.id); if (e.key==='Escape') setEditingDoc(null); }}
        />
      ) : (
        <>
          <span className="sidebar-doc-icon">{ENTRY_ICONS[doc.entry_type] || '📄'}</span>
          <span className="sidebar-doc-title">{doc.title}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="sidebar">
      {/* Search */}
      <div className="sidebar-search" onClick={() => setShowSearch(true)}>
        <span className="sb-search-icon">⌕</span>
        <span className="sb-search-placeholder">Search vault…</span>
        <kbd className="sb-search-kbd">⌘K</kbd>
      </div>

      {/* Workspaces */}
      <div className="sidebar-section-label">WORKSPACES</div>
      <div className="sidebar-workspaces">
        {workspaces.map(ws => (
          <div
            key={ws.id}
            className={`sidebar-ws ${activeWsId === ws.id ? 'active' : ''}`}
            onClick={() => selectWorkspace(ws.id)}
          >
            <div className="sidebar-ws-dot" style={{ background: ws.color }} />
            <span className="sidebar-ws-name">{ws.name}</span>
            {activeWsId === ws.id && (
              <span className="sidebar-ws-count">{documents.filter(d=>!d.is_folder).length}</span>
            )}
          </div>
        ))}
        <div className="sidebar-add-ws" onClick={() => setShowNewWs(p => !p)}>
          <span>＋</span> Add workspace
        </div>
        {showNewWs && (
          <div className="sidebar-new-ws-form">
            <input className="sidebar-input" placeholder="Workspace name" value={newWsName} onChange={e=>setNewWsName(e.target.value)} />
            <div className="sidebar-color-row">
              {['#7C3AED','#059669','#2563EB','#D97706','#DB2777','#0891B2','#6B7280','#DC2626'].map(c => (
                <div key={c} className={`sidebar-color-swatch ${newWsColor===c?'sel':''}`} style={{background:c}} onClick={()=>setNewWsColor(c)} />
              ))}
            </div>
            <button className="sidebar-create-btn" onClick={handleCreateWs}>Create</button>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="sidebar-section-label" style={{marginTop:12}}>
        DOCUMENTS
        <button className="sidebar-new-btn" onClick={() => setShowNewDoc(p=>!p)} title="New document">＋</button>
      </div>

      {showNewDoc && (
        <div className="sidebar-new-doc-form">
          <input
            className="sidebar-input"
            placeholder="Document title"
            value={newDocTitle}
            onChange={e => setNewDocTitle(e.target.value)}
            onKeyDown={e => e.key==='Enter' && handleCreate()}
            autoFocus
          />
          <div className="sidebar-type-row">
            {Object.entries(ENTRY_ICONS).map(([t, icon]) => (
              <div key={t} className={`sidebar-type-chip ${newDocType===t?'sel':''}`} onClick={()=>setNewDocType(t)}>
                {icon} {t}
              </div>
            ))}
          </div>
          <label className="sidebar-folder-check">
            <input type="checkbox" checked={newDocFolder} onChange={e=>setNewDocFolder(e.target.checked)} />
            Create as folder
          </label>
          <div className="sidebar-form-btns">
            <button className="sidebar-create-btn" onClick={handleCreate}>Create</button>
            <button className="sidebar-cancel-btn" onClick={()=>setShowNewDoc(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="sidebar-docs">
        {/* Folders */}
        {folders.map(folder => (
          <div key={folder.id}>
            <div className="sidebar-folder" onClick={() => toggleExpand(folder.id)}
              onContextMenu={e => { e.preventDefault(); setCtxMenu({ x:e.clientX, y:e.clientY, doc:folder }); }}>
              <span className="sidebar-folder-arrow">{expanded[folder.id] ? '▾' : '▸'}</span>
              {editingDoc === folder.id ? (
                <input ref={editRef} className="sidebar-rename" value={editTitle}
                  onChange={e=>setEditTitle(e.target.value)}
                  onBlur={()=>commitRename(folder.id)}
                  onKeyDown={e=>{if(e.key==='Enter')commitRename(folder.id);if(e.key==='Escape')setEditingDoc(null);}}
                />
              ) : (
                <span className="sidebar-folder-name">📂 {folder.title}</span>
              )}
            </div>
            {expanded[folder.id] && (
              <div className="sidebar-folder-children">
                {inFolder(folder.id).map(renderDoc)}
              </div>
            )}
          </div>
        ))}
        {/* Root docs */}
        {roots.map(renderDoc)}
      </div>

      {/* Quick access */}
      <div className="sidebar-section-label" style={{marginTop:'auto',paddingTop:12}}>QUICK ACCESS</div>
      <div className="sidebar-quick">
        <div className="sidebar-quick-item" onClick={openNewScratch}>📋 New scratch pad</div>
        <div className="sidebar-quick-item" onClick={() => setShowSettings(true)}>⚙️ Settings</div>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <div className="ctx-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          <div className="ctx-item" onClick={() => openDocInTab(ctxMenu.doc.id, ctxMenu.doc.title)}>📂 Open</div>
          <div className="ctx-item" onClick={() => startRename(ctxMenu.doc)}>✏️ Rename</div>
          <div className="ctx-sep" />
          <div className="ctx-item danger" onClick={() => { deleteDocument(ctxMenu.doc.id); setCtxMenu(null); }}>🗑 Delete</div>
        </div>
      )}
    </div>
  );
}
