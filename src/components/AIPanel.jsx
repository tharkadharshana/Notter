import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const QUICK_PROMPTS = [
  { label: '✦ Organize & prettify',    msg: 'Organize and prettify the content in the current document. Add proper sections, format code blocks, and make it easy to read.' },
  { label: '🔑 Extract credentials',   msg: 'Find and list all credentials (usernames, passwords, API keys, hosts) in the current document in a clear table format.' },
  { label: '💻 Extract commands',      msg: 'Extract all commands, SQL queries, and scripts from the current document. Group them by type and add descriptions.' },
  { label: '📋 Summarize document',    msg: 'Give me a brief summary of what this document contains and what it is used for.' },
  { label: '🔍 Find security issues',  msg: 'Review this document for any security concerns — weak passwords, exposed secrets, insecure configs, etc.' },
  { label: '🗂 Suggest structure',     msg: 'How should I better organize this document? Suggest a clear structure with sections and tags.' },
];

export default function AIPanel() {
  const { activeTab, settings } = useApp();
  const [messages,  setMessages]  = useState([
    { role:'assistant', content:'Hello! I can help you organize your documents, extract information, answer questions about your vault content, or explain technical configs. What would you like help with?' }
  ]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [provider,  setProvider]  = useState(settings.defaultAI || 'gemini');
  const [showQuick, setShowQuick] = useState(true);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  const getDocContext = () => {
    if (!activeTab?.content) return '';
    const preview = activeTab.content.slice(0, 4000);
    return `\n\n--- Current document: "${activeTab.title}" ---\n${preview}${activeTab.content.length > 4000 ? '\n[...truncated]' : ''}`;
  };

  const send = async (userMsg) => {
    const msg = (userMsg || input).trim();
    if (!msg || loading) return;
    setInput('');
    setShowQuick(false);

    const sett   = await window.vault.settings.get();
    const useGem = provider === 'gemini';
    const apiKey = useGem ? sett.geminiApiKey : sett.deepseekApiKey;

    if (!apiKey) {
      setMessages(p => [...p,
        { role:'user', content:msg },
        { role:'assistant', content:'⚠️ No API key set. Please go to **Settings → AI** and add your ' + (useGem?'Gemini':'DeepSeek') + ' API key.' }
      ]);
      return;
    }

    const history = [...messages, { role:'user', content:msg }];
    setMessages(history);
    setLoading(true);

    const system = `You are an AI assistant embedded inside DevVault, a secure developer knowledge base app. 
You help developers organize documentation, understand configs, manage credentials, and analyze technical content.
Be concise and practical. Format code with markdown code blocks.
When showing credentials or sensitive info from documents, keep your response focused.${getDocContext()}`;

    const apiMessages = history.filter(m => m.role !== 'system').slice(-12);

    try {
      let result;
      if (useGem) {
        result = await window.vault.ai.gemini({ apiKey, model: sett.geminiModel || 'gemini-1.5-pro', messages: apiMessages, system });
      } else {
        result = await window.vault.ai.deepseek({ apiKey, model: sett.deepseekModel || 'deepseek-chat', messages: apiMessages, system });
      }

      setMessages(p => [...p, {
        role:'assistant',
        content: result.ok ? result.text : `⚠️ Error: ${result.error}`
      }]);
    } catch(e) {
      setMessages(p => [...p, { role:'assistant', content:`⚠️ Unexpected error: ${e.message}` }]);
    } finally { setLoading(false); }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clear = () => {
    setMessages([{ role:'assistant', content:'Chat cleared. How can I help you?' }]);
    setShowQuick(true);
  };

  const renderMessage = (msg, i) => {
    const isAI = msg.role === 'assistant';
    // Simple markdown rendering for code blocks
    const rendered = renderMarkdown(msg.content);
    return (
      <div key={i} className={`ai-msg ${isAI?'ai':'user'}`}>
        {isAI && <div className="ai-msg-avatar">✦</div>}
        <div className="ai-msg-body" dangerouslySetInnerHTML={{ __html: rendered }} />
      </div>
    );
  };

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="ai-panel-header">
        <div className="ai-provider-toggle">
          <button className={`ai-prov ${provider==='gemini'?'active':''}`}   onClick={()=>setProvider('gemini')}>Gemini</button>
          <button className={`ai-prov ${provider==='deepseek'?'active':''}`} onClick={()=>setProvider('deepseek')}>DeepSeek</button>
        </div>
        <button className="ai-clear-btn" onClick={clear} title="Clear chat">⊘ Clear</button>
      </div>

      {/* Messages */}
      <div className="ai-messages">
        {messages.map(renderMessage)}
        {loading && (
          <div className="ai-msg ai">
            <div className="ai-msg-avatar">✦</div>
            <div className="ai-typing"><span/><span/><span/></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {showQuick && (
        <div className="ai-quick-prompts">
          <div className="ai-quick-label">Quick actions</div>
          {QUICK_PROMPTS.map((qp, i) => (
            <button key={i} className="ai-quick-btn" onClick={() => send(qp.msg)}>{qp.label}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="ai-input-area">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything about your documents… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={loading}
        />
        <button
          className="ai-send-btn"
          onClick={() => send()}
          disabled={loading || !input.trim()}
          title="Send (Enter)"
        >
          {loading ? <span className="spin">⟳</span> : '↑'}
        </button>
      </div>
    </div>
  );
}

// Simple markdown → HTML (safe, no external lib needed)
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="ai-code-block"><code class="lang-${lang||'text'}">${code}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4 class="ai-h">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 class="ai-h">$1</h3>')
    .replace(/^# (.+)$/gm,   '<h2 class="ai-h">$1</h2>')
    // Bullet lists
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    // Newlines
    .replace(/\n/g, '<br>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)(<br>)?/g, '$1').replace(/(<li>[^]*?<\/li>)+/g, m => `<ul class="ai-ul">${m}</ul>`);
  return html;
}
