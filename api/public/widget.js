(function() {
  const API = 'https://guider-app.vercel.app';
  let messages = [];
  const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);

  // Load Cairo font from Google Fonts (proper Arabic web font)
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  const style = document.createElement('style');
  style.textContent = `
    #guider-fab {
      position: fixed; bottom: 24px; left: 24px; z-index: 9999;
      display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
      font-family: 'Cairo', system-ui, sans-serif;
    }
    #guider-bubble {
      background: #0d1f3c; border-radius: 14px 14px 14px 4px;
      padding: 11px 16px; font-size: 13px; color: #fff;
      box-shadow: 0 4px 20px rgba(13,31,60,0.25);
      font-family: 'Cairo', sans-serif; font-weight: 600;
      animation: guiderFloat 3s ease-in-out infinite;
      border-right: 3px solid #c8a96e;
      max-width: 220px; direction: rtl;
      cursor: pointer;
      transition: opacity 0.3s, transform 0.3s;
    }
    #guider-bubble.hidden {
      opacity: 0; transform: translateY(10px); pointer-events: none;
    }
    #guider-btn {
      width: 60px; height: 60px; border-radius: 50%;
      background: #0d1f3c;
      border: 2px solid #c8a96e; font-size: 28px; cursor: pointer;
      box-shadow: 0 6px 24px rgba(13,31,60,0.4);
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex; align-items: center; justify-content: center;
      color: #fff;
    }
    #guider-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 8px 32px rgba(13,31,60,0.5);
    }

    #guider-widget {
      position: fixed; bottom: 100px; left: 24px;
      width: 380px; height: 600px;
      max-height: calc(100vh - 140px);
      background: #fff; border-radius: 20px;
      box-shadow: 0 20px 60px rgba(13,31,60,0.3);
      z-index: 9998; display: none; flex-direction: column;
      font-family: 'Cairo', sans-serif; overflow: hidden;
      direction: rtl;
    }
    #guider-widget.open { display: flex; }

    /* Mobile responsive */
    @media (max-width: 480px) {
      #guider-widget {
        width: calc(100vw - 24px);
        left: 12px; right: 12px;
        bottom: 90px;
        height: calc(100vh - 110px);
        max-height: calc(100vh - 110px);
      }
      #guider-fab { left: 12px; bottom: 12px; }
      #guider-bubble { max-width: 180px; font-size: 12px; }
    }

    #guider-header {
      background: linear-gradient(135deg, #081529, #0d1f3c);
      padding: 18px 22px; color: #fff;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #c8a96e;
    }
    #guider-header-title {
      font-size: 16px; font-weight: 700; color: #fff;
    }
    #guider-header-sub {
      font-size: 12px; opacity: 0.75; margin-top: 3px; color: #c8a96e;
    }
    #guider-close {
      background: rgba(255,255,255,0.1); border: none;
      color: #fff; width: 32px; height: 32px; border-radius: 50%;
      cursor: pointer; font-size: 14px;
      transition: background 0.2s;
      display: flex; align-items: center; justify-content: center;
    }
    #guider-close:hover { background: rgba(255,255,255,0.2); }

    #guider-messages {
      flex: 1; overflow-y: auto; padding: 18px 16px;
      display: flex; flex-direction: column; gap: 12px;
      background: #faf7f2;
      scroll-behavior: smooth;
    }

    .guider-msg-ai, .guider-msg-user {
      max-width: 88%; padding: 12px 16px;
      font-size: 14px; line-height: 1.7;
      word-wrap: break-word;
      font-family: 'Cairo', sans-serif;
      font-weight: 500;
    }
    .guider-msg-ai {
      background: #fff;
      color: #0d1f3c; align-self: flex-start;
      border-radius: 4px 16px 16px 16px;
      border-right: 3px solid #c8a96e;
      box-shadow: 0 2px 8px rgba(13,31,60,0.06);
    }
    .guider-msg-user {
      background: #0d1f3c; color: #fff;
      border-radius: 16px 4px 16px 16px;
      align-self: flex-end;
      font-weight: 600;
    }

    /* Markdown styling */
    .guider-msg-ai strong {
      color: #0d1f3c;
      font-weight: 800;
    }
    .guider-msg-ai .guider-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #0d1f3c;
      text-decoration: none;
      font-weight: 700;
      padding: 6px 12px;
      background: #faf7f2;
      border: 1.5px solid #c8a96e;
      border-radius: 20px;
      margin: 3px 2px;
      transition: all 0.2s;
      font-size: 13px;
    }
    .guider-msg-ai .guider-link:hover {
      background: #0d1f3c;
      color: #fff;
      border-color: #0d1f3c;
    }
    /* WhatsApp links get green styling */
    .guider-msg-ai .guider-link[href*="wa.me"] {
      background: #25d366;
      color: #fff;
      border-color: #25d366;
    }
    .guider-msg-ai .guider-link[href*="wa.me"]:hover {
      background: #1da851;
      border-color: #1da851;
    }

    .guider-choices {
      display: flex; flex-wrap: wrap; gap: 8px;
      margin-top: 4px;
      justify-content: flex-end;
    }
    .guider-choice {
      background: #fff; border: 1.5px solid #0d1f3c;
      color: #0d1f3c; border-radius: 22px;
      padding: 8px 14px; font-size: 13px;
      cursor: pointer; font-family: 'Cairo', sans-serif;
      font-weight: 600;
      transition: all 0.2s;
    }
    .guider-choice:hover {
      background: #0d1f3c; color: #fff;
      transform: translateY(-1px);
    }

    /* Typing indicator */
    .guider-typing {
      background: #fff;
      align-self: flex-start;
      padding: 14px 18px;
      border-radius: 4px 16px 16px 16px;
      border-right: 3px solid #c8a96e;
      display: flex; gap: 4px;
      align-items: center;
      box-shadow: 0 2px 8px rgba(13,31,60,0.06);
    }
    .guider-typing span {
      width: 7px; height: 7px;
      background: #c8a96e;
      border-radius: 50%;
      animation: guiderBounce 1.2s infinite ease-in-out;
    }
    .guider-typing span:nth-child(2) { animation-delay: 0.15s; }
    .guider-typing span:nth-child(3) { animation-delay: 0.3s; }

    #guider-input-row {
      padding: 14px 16px; border-top: 1px solid #e0dbd0;
      display: flex; gap: 8px; background: #fff;
    }
    #guider-input {
      flex: 1; border: 1.5px solid #e0d9ce; border-radius: 12px;
      padding: 11px 14px; font-family: 'Cairo', sans-serif;
      font-size: 14px; outline: none; direction: rtl;
      transition: border-color 0.2s;
    }
    #guider-input:focus { border-color: #0d1f3c; }
    #guider-send {
      background: #0d1f3c; color: #fff; border: none;
      border-radius: 12px; padding: 11px 18px;
      font-family: 'Cairo', sans-serif; font-size: 14px;
      font-weight: 700; cursor: pointer;
      transition: background 0.2s;
    }
    #guider-send:hover { background: #081529; }

    @keyframes guiderFloat {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
    @keyframes guiderBounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
      40% { transform: translateY(-6px); opacity: 1; }
    }

    /* Scrollbar */
    #guider-messages::-webkit-scrollbar { width: 6px; }
    #guider-messages::-webkit-scrollbar-track { background: transparent; }
    #guider-messages::-webkit-scrollbar-thumb {
      background: #c8a96e;
      border-radius: 3px;
    }
  `;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML('beforeend', `
    <div id="guider-fab">
      <div id="guider-bubble">☕ خلني أرشّحلك قهوتك</div>
      <button id="guider-btn" aria-label="فتح أحمد باريستا">☕</button>
    </div>
    <div id="guider-widget">
      <div id="guider-header">
        <div>
          <div id="guider-header-title">أحمد — باريستا دريب اون</div>
          <div id="guider-header-sub">اسألني عن أي قهوة</div>
        </div>
        <button id="guider-close" aria-label="إغلاق">✕</button>
      </div>
      <div id="guider-messages"></div>
      <div id="guider-input-row">
        <button id="guider-send">إرسال</button>
        <input id="guider-input" placeholder="اكتب هنا..." />
      </div>
    </div>
  `);

  const widget = document.getElementById('guider-widget');
  const bubble = document.getElementById('guider-bubble');
  const messagesEl = document.getElementById('guider-messages');
  const input = document.getElementById('guider-input');

  // Markdown renderer — converts **bold**, [text](url), and line breaks
  function renderMarkdown(text) {
    let html = text;
    // Escape HTML first (XSS protection)
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Bold: **text** → <strong>text</strong>
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // Links: [text](url) → <a>
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="guider-link">$1</a>'
    );
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  // Parse choices from text — only after CHOICES: marker, ignore markdown link brackets
  function parseChoices(text) {
    const choicesIndex = text.indexOf('CHOICES:');
    if (choicesIndex === -1) return { text, choices: [] };

    const messageText = text.substring(0, choicesIndex).trim();
    const choicesPart = text.substring(choicesIndex);

    // Match [text] but NOT [text](url) (markdown links)
    const choices = [...choicesPart.matchAll(/\[([^\]]+)\](?!\()/g)].map(m => m[1]);

    return { text: messageText, choices };
  }

  function addMessage(text, role) {
    const { text: cleanText, choices } = parseChoices(text);
    const div = document.createElement('div');
    div.className = role === 'assistant' ? 'guider-msg-ai' : 'guider-msg-user';

    if (role === 'assistant') {
      div.innerHTML = renderMarkdown(cleanText);
    } else {
      div.textContent = cleanText;
    }
    messagesEl.appendChild(div);

    if (choices.length > 0) {
      const choicesDiv = document.createElement('div');
      choicesDiv.className = 'guider-choices';
      choices.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'guider-choice';
        btn.textContent = c;
        btn.onclick = () => { choicesDiv.remove(); sendMessage(c); };
        choicesDiv.appendChild(btn);
      });
      messagesEl.appendChild(choicesDiv);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage(text) {
    const msg = text || input.value.trim();
    if (!msg) return;
    if (!text) input.value = '';
    addMessage(msg, 'user');
    messages.push({ role: 'user', content: msg });

    // Animated typing indicator (3 bouncing dots)
    const typing = document.createElement('div');
    typing.className = 'guider-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const res = await fetch(`${API}/api/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, sessionId })
      });
      const data = await res.json();
      typing.remove();
      addMessage(data.reply, 'assistant');
      messages.push({ role: 'assistant', content: data.reply });
    } catch(e) {
      typing.remove();
      addMessage('حدث خطأ، حاول مرة ثانية', 'assistant');
    }
  }

  function openWidget() {
    widget.classList.add('open');
    bubble.classList.add('hidden');

    if (typeof gtag !== 'undefined') {
      gtag('event', 'guider_opened', {
        event_category: 'Guider',
        event_label: 'Widget Opened'
      });
    }

    if (messages.length === 0) {
      setTimeout(() => {
        const welcome = 'مرحباً! كيف تحب قهوتك اليوم؟\nCHOICES: [مع الحليب 🥛] [بلاك حار ☕] [بلاك بارد ❄️] [ما أعرف، ساعدني 🤷]';
        addMessage(welcome, 'assistant');
        messages.push({ role: 'assistant', content: welcome });
      }, 300);
    }
  }

  function closeWidget() {
    widget.classList.remove('open');
    // Bubble stays hidden — user knows widget exists, no need to keep nagging
  }

  // Bubble click also opens widget (better UX than only the button)
  bubble.onclick = openWidget;
  document.getElementById('guider-btn').onclick = openWidget;
  document.getElementById('guider-close').onclick = closeWidget;
  document.getElementById('guider-send').onclick = () => sendMessage();
  input.onkeypress = e => { if (e.key === 'Enter') sendMessage(); };
})();
