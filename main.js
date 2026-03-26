const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const https  = require('https');

// ─── Paths ────────────────────────────────────────────────────────────────────
const VAULT_DIR = path.join(app.getPath('userData'), 'devvault');
const DB_PATH   = path.join(VAULT_DIR, 'vault.db');
const AUTH_PATH = path.join(VAULT_DIR, '.auth.json');
const SETT_PATH = path.join(VAULT_DIR, 'settings.json');

let mainWindow, SQL, db, encKey;

function ensureDir() {
  if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SQL.JS INIT (pure WASM, no native compilation)
// ═══════════════════════════════════════════════════════════════════════════════
async function initDatabase() {
  ensureDir();
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`PRAGMA foreign_keys = ON;`);

  db.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#7C3AED',
      icon TEXT DEFAULT '📁',
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      parent_id TEXT DEFAULT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT DEFAULT '[]',
      entry_type TEXT DEFAULT 'note',
      sort_order INTEGER DEFAULT 0,
      is_folder INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS tabs (
      id TEXT PRIMARY KEY,
      document_id TEXT DEFAULT NULL,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      is_scratch INTEGER DEFAULT 0,
      tab_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS markers (
      document_id TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      color TEXT NOT NULL,
      PRIMARY KEY (document_id, line_number)
    );
    CREATE TABLE IF NOT EXISTS marker_tags (
      document_id TEXT NOT NULL,
      color TEXT NOT NULL,
      emoji TEXT DEFAULT '',
      label TEXT DEFAULT '',
      PRIMARY KEY (document_id, color)
    );
  `);

  // Seed default workspaces
  const count = db.exec("SELECT COUNT(*) as c FROM workspaces")[0]?.values[0][0] || 0;
  if (count === 0) {
    const ws = [
      ['ws-telco',   'Telco / Core Net',  '#7C3AED', '📡', 0],
      ['ws-devops',  'DevOps & CI/CD',    '#059669', '⚙️', 1],
      ['ws-server',  'Server Infra',      '#2563EB', '🖥️', 2],
      ['ws-mobile',  'Mobile Dev',        '#D97706', '📱', 3],
      ['ws-aiml',    'AI / ML Projects',  '#DB2777', '🤖', 4],
      ['ws-network', 'Networking',        '#0891B2', '🌐', 5],
      ['ws-scratch', 'Scratch Pads',      '#6B7280', '📋', 6],
    ];
    for (const [id, name, color, icon, order] of ws) {
      db.run('INSERT INTO workspaces (id,name,color,icon,sort_order) VALUES (?,?,?,?,?)', [id, name, color, icon, order]);
    }
  }

  saveDb();
}

// Save DB to disk after every write
function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function genId() { return crypto.randomUUID(); }

// ── sql.js helpers ─────────────────────────────────────────────────────────────
function dbAll(sql, params = []) {
  try {
    const res = db.exec(sql, params);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch(e) { console.error('dbAll error:', sql, e.message); return []; }
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}

function dbRun(sql, params = []) {
  try { db.run(sql, params); saveDb(); }
  catch(e) { console.error('dbRun error:', sql, e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRYPTO  (AES-256-GCM + PBKDF2)
// ═══════════════════════════════════════════════════════════════════════════════
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, Buffer.from(salt, 'base64'), 310000, 32, 'sha256');
}

function encrypt(plaintext) {
  if (!encKey) throw new Error('Not authenticated');
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext ?? ''), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString('base64'), data: enc.toString('base64'), tag: tag.toString('base64') });
}

function decrypt(ciphertext) {
  if (!encKey) throw new Error('Not authenticated');
  if (!ciphertext || ciphertext === '') return '';
  try {
    const { iv, data, tag } = JSON.parse(ciphertext);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch(e) { return ''; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
function hasPassword()         { return fs.existsSync(AUTH_PATH); }

function setPassword(password) {
  const salt = crypto.randomBytes(32).toString('base64');
  const key  = deriveKey(password, salt);
  const hash = crypto.createHash('sha256').update(key).digest('base64');
  ensureDir();
  fs.writeFileSync(AUTH_PATH, JSON.stringify({ salt, hash }));
  encKey = key;
  return true;
}

function verifyPassword(password) {
  if (!fs.existsSync(AUTH_PATH)) return false;
  try {
    const { salt, hash } = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
    const key  = deriveKey(password, salt);
    const test = crypto.createHash('sha256').update(key).digest('base64');
    if (test === hash) { encKey = key; return true; }
    return false;
  } catch(e) { return false; }
}

function changePassword(oldPwd, newPwd) {
  if (!verifyPassword(oldPwd)) return { success: false, error: 'Incorrect current password' };
  const oldKey = encKey;
  setPassword(newPwd);
  const newKey = encKey;

  const docs = dbAll('SELECT id, content FROM documents');
  for (const doc of docs) {
    try {
      encKey = oldKey; const plain = decrypt(doc.content);
      encKey = newKey; dbRun('UPDATE documents SET content=? WHERE id=?', [encrypt(plain), doc.id]);
    } catch(e) {}
  }
  const tabs = dbAll('SELECT id, content FROM tabs');
  for (const tab of tabs) {
    try {
      encKey = oldKey; const plain = decrypt(tab.content);
      encKey = newKey; dbRun('UPDATE tabs SET content=? WHERE id=?', [encrypt(plain), tab.id]);
    } catch(e) {}
  }
  encKey = newKey;
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULTS = {
  theme: 'dark', fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  wordWrap: false, autoSave: true, autoPrettify: false,
  defaultAI: 'gemini', geminiApiKey: '', deepseekApiKey: '',
  geminiModel: 'gemini-2.0-flash', deepseekModel: 'deepseek-chat',
  tabSize: 2, highlightCurrentLine: true, bracketMatching: true,
  autoCloseBrackets: true, prettifyPrompt: '',
  sidebarWidth: 220, rightPanelWidth: 300
};

function getSettings() {
  try { if (fs.existsSync(SETT_PATH)) return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETT_PATH, 'utf8')) }; }
  catch(e) {}
  return { ...DEFAULTS };
}

function saveSettings(s) { ensureDir(); fs.writeFileSync(SETT_PATH, JSON.stringify(s, null, 2)); }

// ═══════════════════════════════════════════════════════════════════════════════
// HTTPS helper (avoids CORS in renderer)
// ═══════════════════════════════════════════════════════════════════════════════
function httpsPost(url, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const u       = new URL(url);
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...extraHeaders }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ _raw: d }); } });
    });
    req.on('error', reject);
    req.write(bodyStr); req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
function setupIPC() {
  // Auth
  ipcMain.handle('auth:has',    ()        => hasPassword());
  ipcMain.handle('auth:set',    (_, p)    => setPassword(p));
  ipcMain.handle('auth:verify', (_, p)    => verifyPassword(p));
  ipcMain.handle('auth:logout', ()        => { encKey = null; return true; });
  ipcMain.handle('auth:change', (_, o, n) => changePassword(o, n));

  // Settings
  ipcMain.handle('settings:get',  ()    => getSettings());
  ipcMain.handle('settings:save', (_, s) => { saveSettings(s); return true; });

  // Workspaces
  ipcMain.handle('ws:all', () => dbAll('SELECT * FROM workspaces ORDER BY sort_order'));
  ipcMain.handle('ws:create', (_, { name, color, icon }) => {
    const id = genId();
    const n  = (dbGet('SELECT COUNT(*) as c FROM workspaces') || { c: 0 }).c;
    dbRun('INSERT INTO workspaces (id,name,color,icon,sort_order) VALUES (?,?,?,?,?)', [id, name, color, icon || '📁', n]);
    return id;
  });
  ipcMain.handle('ws:update', (_, { id, name, color, icon }) => {
    dbRun('UPDATE workspaces SET name=?,color=?,icon=? WHERE id=?', [name, color, icon, id]); return true;
  });
  ipcMain.handle('ws:delete', (_, id) => { dbRun('DELETE FROM workspaces WHERE id=?', [id]); return true; });

  // Documents
  ipcMain.handle('doc:list', (_, wsId) =>
    dbAll('SELECT id,workspace_id,parent_id,title,tags,entry_type,sort_order,is_folder,created_at,updated_at FROM documents WHERE workspace_id=? ORDER BY is_folder DESC,sort_order,title', [wsId])
  );
  ipcMain.handle('doc:get', (_, id) => {
    const d = dbGet('SELECT * FROM documents WHERE id=?', [id]);
    if (!d) return null;
    d.content = decrypt(d.content);
    return d;
  });
  ipcMain.handle('doc:create', (_, { wsId, parentId, title, content, entryType, isFolder }) => {
    const id  = genId();
    const enc = encrypt(content || '');
    const n   = (dbGet('SELECT COUNT(*) as c FROM documents WHERE workspace_id=?', [wsId]) || { c: 0 }).c;
    dbRun('INSERT INTO documents (id,workspace_id,parent_id,title,content,entry_type,is_folder,sort_order) VALUES (?,?,?,?,?,?,?,?)',
      [id, wsId, parentId || null, title, enc, entryType || 'note', isFolder ? 1 : 0, n]);
    return id;
  });
  ipcMain.handle('doc:update', (_, { id, title, content, entryType, tags }) => {
    const enc = encrypt(content ?? '');
    const now = Math.floor(Date.now() / 1000);
    dbRun('UPDATE documents SET title=COALESCE(?,title), content=?, entry_type=COALESCE(?,entry_type), tags=COALESCE(?,tags), updated_at=? WHERE id=?',
      [title, enc, entryType, tags, now, id]);
    return true;
  });
  ipcMain.handle('doc:delete', (_, id) => { dbRun('DELETE FROM documents WHERE id=?', [id]); return true; });
  ipcMain.handle('doc:move',   (_, { id, newParentId, newWsId }) => {
    dbRun('UPDATE documents SET parent_id=?,workspace_id=? WHERE id=?', [newParentId || null, newWsId, id]); return true;
  });

  // Tabs
  ipcMain.handle('tab:all', () => {
    const tabs = dbAll('SELECT * FROM tabs ORDER BY tab_order');
    return tabs.map(t => ({ ...t, content: decrypt(t.content) }));
  });
  ipcMain.handle('tab:save', (_, { id, documentId, title, content, isScratch, tabOrder, isActive }) => {
    const enc = encrypt(content || '');
    const ex  = dbGet('SELECT id FROM tabs WHERE id=?', [id]);
    if (ex) {
      dbRun('UPDATE tabs SET document_id=?,title=?,content=?,is_scratch=?,tab_order=?,is_active=? WHERE id=?',
        [documentId || null, title, enc, isScratch ? 1 : 0, tabOrder || 0, isActive ? 1 : 0, id]);
    } else {
      dbRun('INSERT INTO tabs (id,document_id,title,content,is_scratch,tab_order,is_active) VALUES (?,?,?,?,?,?,?)',
        [id, documentId || null, title, enc, isScratch ? 1 : 0, tabOrder || 0, isActive ? 1 : 0]);
    }
    return true;
  });
  ipcMain.handle('tab:delete', (_, id) => { dbRun('DELETE FROM tabs WHERE id=?', [id]); return true; });

  // Markers
  ipcMain.handle('marker:get',   (_, docId)             => dbAll('SELECT * FROM markers WHERE document_id=?', [docId]));
  ipcMain.handle('marker:set',   (_, { docId, line, color }) => {
    if (!color) dbRun('DELETE FROM markers WHERE document_id=? AND line_number=?', [docId, line]);
    else        dbRun('INSERT OR REPLACE INTO markers (document_id,line_number,color) VALUES (?,?,?)', [docId, line, color]);
    return true;
  });
  ipcMain.handle('marker:clear',    (_, docId) => { dbRun('DELETE FROM markers WHERE document_id=?', [docId]); return true; });
  ipcMain.handle('marker:getTags',  (_, docId) => {
    const rows = dbAll('SELECT color, emoji, label FROM marker_tags WHERE document_id=?', [docId]);
    const result = {};
    for (const r of rows) result[r.color] = { emoji: r.emoji || '', text: r.label || '' };
    return result;
  });
  ipcMain.handle('marker:saveTags', (_, { docId, tags }) => {
    dbRun('DELETE FROM marker_tags WHERE document_id=?', [docId]);
    for (const [color, tag] of Object.entries(tags || {})) {
      if (tag?.emoji || tag?.text) {
        dbRun('INSERT INTO marker_tags (document_id,color,emoji,label) VALUES (?,?,?,?)',
          [docId, color, tag.emoji || '', tag.text || '']);
      }
    }
    return true;
  });

  // Search (full-text across all docs)
  ipcMain.handle('search:all', (_, query) => {
    if (!query || query.trim().length < 2) return [];
    const lower = query.toLowerCase();
    const docs  = dbAll('SELECT d.*,w.name as ws_name,w.color as ws_color FROM documents d LEFT JOIN workspaces w ON d.workspace_id=w.id WHERE d.is_folder=0');
    const results = [];
    for (const doc of docs) {
      const plain = decrypt(doc.content);
      if (!doc.title.toLowerCase().includes(lower) && !plain.toLowerCase().includes(lower)) continue;
      const lines = plain.split('\n');
      let matchLine = '';
      for (const ln of lines) {
        if (ln.toLowerCase().includes(lower)) { matchLine = ln.trim().slice(0, 100); break; }
      }
      results.push({ id: doc.id, title: doc.title, wsName: doc.ws_name || '', wsColor: doc.ws_color || '#666', matchLine, updatedAt: doc.updated_at, entryType: doc.entry_type });
    }
    return results.slice(0, 30);
  });

  // AI: Gemini
  ipcMain.handle('ai:gemini', async (_, { apiKey, model, messages, system }) => {
    try {
      const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const body = {
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
      };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`;
      const res = await httpsPost(url, {}, body);
      const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { ok: true, text };
      return { ok: false, error: res.error?.message || JSON.stringify(res).slice(0, 300) };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // AI: DeepSeek
  ipcMain.handle('ai:deepseek', async (_, { apiKey, model, messages, system }) => {
    try {
      const all = system ? [{ role: 'system', content: system }, ...messages] : messages;
      const res = await httpsPost('https://api.deepseek.com/chat/completions',
        { 'Authorization': `Bearer ${apiKey}` },
        { model: model || 'deepseek-chat', messages: all, max_tokens: 8192, temperature: 0.7 }
      );
      const text = res.choices?.[0]?.message?.content;
      if (text) return { ok: true, text };
      return { ok: false, error: res.error?.message || JSON.stringify(res).slice(0, 300) };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // Window controls
  ipcMain.handle('win:min',        () => mainWindow?.minimize());
  ipcMain.handle('win:max',        () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.handle('win:close',      () => mainWindow?.close());
  ipcMain.handle('win:fullscreen', () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()));
}

// ═══════════════════════════════════════════════════════════════════════════════
// WINDOW
// ═══════════════════════════════════════════════════════════════════════════════
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    frame: false, backgroundColor: '#0d0d0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  if (process.env.DEV_TOOLS) mainWindow.webContents.openDevTools();
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  ensureDir();
  await initDatabase();
  setupIPC();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { if (db) db.close(); });
