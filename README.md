# DevVault — Secure Developer Knowledge Base

A password-protected, AES-256 encrypted desktop notepad for developers.
Replaces one giant messy text file with structured, searchable, AI-organized workspaces.

---

## ✅ NO BUILD TOOLS REQUIRED

This version uses **sql.js** (pure WebAssembly SQLite) — no Visual Studio,
no node-gyp, no native compilation. Works on Windows, Mac, and Linux out of the box.

---

## Quick Start (Windows)

```
1. Install Node.js 18 or 20 from https://nodejs.org  (LTS recommended)
   NOTE: Node 24 works but Node 18/20 LTS is more stable for Electron

2. Open PowerShell or Command Prompt in the devvault folder

3. Run:
   npm install
   npm run dev

4. The app will launch. Set your master password on first run.
```

## Quick Start (Mac / Linux)

```bash
npm install
npm run dev
```

---

## First Run

1. The app opens to a password screen
2. **Create a master password** — this encrypts everything with AES-256-GCM
3. ⚠️ The password cannot be recovered if lost — remember it!

---

## AI Setup

1. Click **⚙ Settings** in the title bar (or Ctrl+,)
2. Go to **AI** tab
3. Paste your **Gemini API key** → https://aistudio.google.com/
4. Paste your **DeepSeek API key** → https://platform.deepseek.com/
5. Choose your default provider and click Save

---

## Key Features

| Feature | How |
|---------|-----|
| New scratch tab | Ctrl+N or click + in tab bar |
| Find & Replace | Ctrl+F |
| Zoom in/out | Ctrl+= / Ctrl+- |
| Go to line | Ctrl+G |
| Fold/unfold code | Click arrow in gutter |
| Move line up/down | Alt+↑ / Alt+↓ |
| Delete line | Ctrl+Shift+K |
| Duplicate line | Ctrl+D |
| Multi-cursor | Alt+Click |
| Settings | Ctrl+, |
| Lock vault | Click 🔒 in title bar |

## Line Markers (Gutter Dots)

- **Click** left gutter dot → cycles colors: Red → Orange → Green → Blue → Purple → clear
- **Click and drag** → paints all lines you drag over with same color
- **Right-click hold + left-click** → marks individual lines with last used color

## Auto-Prettify

Paste messy raw content → click **✦ Prettify** in toolbar.
The AI will detect SQL, CLI commands, Wireshark filters, credentials, configs
and restructure them into clean labeled sections with proper code blocks.

---

## Security

- **AES-256-GCM** encryption on all document and tab content
- **PBKDF2-SHA256** key derivation (310,000 iterations)
- **All data stored locally** in `%APPDATA%\devvault\vault.db` (Windows)
- Zero cloud, zero telemetry

