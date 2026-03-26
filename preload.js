const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vault', {
  auth: {
    has:     ()        => ipcRenderer.invoke('auth:has'),
    set:     p        => ipcRenderer.invoke('auth:set', p),
    verify:  p        => ipcRenderer.invoke('auth:verify', p),
    logout:  ()        => ipcRenderer.invoke('auth:logout'),
    change:  (o, n)   => ipcRenderer.invoke('auth:change', o, n),
  },
  settings: {
    get:  ()  => ipcRenderer.invoke('settings:get'),
    save: s   => ipcRenderer.invoke('settings:save', s),
  },
  ws: {
    all:    ()    => ipcRenderer.invoke('ws:all'),
    create: d     => ipcRenderer.invoke('ws:create', d),
    update: d     => ipcRenderer.invoke('ws:update', d),
    delete: id    => ipcRenderer.invoke('ws:delete', id),
  },
  doc: {
    list:   wsId  => ipcRenderer.invoke('doc:list', wsId),
    get:    id    => ipcRenderer.invoke('doc:get', id),
    create: d     => ipcRenderer.invoke('doc:create', d),
    update: d     => ipcRenderer.invoke('doc:update', d),
    delete: id    => ipcRenderer.invoke('doc:delete', id),
    move:   d     => ipcRenderer.invoke('doc:move', d),
  },
  tab: {
    all:    ()    => ipcRenderer.invoke('tab:all'),
    save:   d     => ipcRenderer.invoke('tab:save', d),
    delete: id    => ipcRenderer.invoke('tab:delete', id),
  },
  marker: {
    get:   docId  => ipcRenderer.invoke('marker:get', docId),
    set:   d      => ipcRenderer.invoke('marker:set', d),
    clear:    docId  => ipcRenderer.invoke('marker:clear', docId),
    getTags:  docId  => ipcRenderer.invoke('marker:getTags', docId),
    saveTags: d      => ipcRenderer.invoke('marker:saveTags', d),
  },
  search: {
    all: q => ipcRenderer.invoke('search:all', q),
  },
  ai: {
    gemini:   d => ipcRenderer.invoke('ai:gemini', d),
    deepseek: d => ipcRenderer.invoke('ai:deepseek', d),
  },
  win: {
    min:        () => ipcRenderer.invoke('win:min'),
    max:        () => ipcRenderer.invoke('win:max'),
    close:      () => ipcRenderer.invoke('win:close'),
    fullscreen: () => ipcRenderer.invoke('win:fullscreen'),
  }
});
