(function() {
  const API = 'https://guider-app.vercel.app';
  let messages = [];

  const style = document.createElement('style');
  style.textContent = `
    #guider-fab {
      position: fixed; bottom: 24px; left: 24px; z-index: 9999;
      display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
    }
    #guider-bubble {
      background: #fff; border-radius: 12px 12px 12px 4px;
      padding: 10px 14px; font-size: 13px; color: #1a1a1a;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      font-family: Cairo, sans-serif; font-weight: 600;
      animation: guiderFloat 3s ease-in-out infinite;
    }
    #guider-btn {
      width: 56px; height: 56px; border-radius: 18px;
      background: linear-gradient(135deg, #2c1a0e, #5c3317);
      border: none; font-size: 26px; cursor: pointer;
      box-shadow: 0 6px 24px rgba(0,0,0,0.3);
      transition: transform 0.2s;
    }
    #guider-btn:hover { transform: scale(1.08); }
    #guider-widget {
      position: fixed; bottom: 100px; left: 24px;
      width: 360px; max-height: 540px;
      background: #fff; border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      z-index: 9998; display: none; flex-direction: column;
      font-family: Cairo, sans-serif; overflow: hidden;
    }
    #guider-widget.open { display: flex; }
    #guider-header {
      background: linear-gradient(135deg, #0d0d0d, #2a1500);
      padding: 16px 20px; color: #fff;
      display: flex; align-items: center; justify-content: space-between;
    }
    #guider-header-title { font-size: 15px; font-weight: 700; }
    #guider-header-sub { font-size: 11px; opacity: 0.6; margin-top: 2px; }
    #guider-close {
      background: rgba(255,255,255,0.1); border: none;
      color: #fff; width: 28px; height: 28px; border-radius: 50%;
      cursor: pointer; font-size: 14px;
    }
    #guider-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
      background: #faf7f3;
    }
    .guider-msg-ai, .guider-msg-user {
      max-width: 85%; padding: 10px 14px;
      font-size: 13px; line-height: 1.6;
    }
    .guider-msg-ai {
      background: #fff; border: 1px solid #e8e2d9;
      color: #1a1a1a; align-self: flex-start;
      border-radius: 4px 14px 14px 14px;
    }
    .guider-msg-user {
      background: #2c1a0e; color: #fff;
      border-radius: 14px 4px 14px 14px;
      align-self: flex-end;
    }
    .guider-choices { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .guider-choice {
      background: #fff; border: 1.5px solid #2c1a0e;
      color: #2c1a0e; border-radius: 20px;
      padding: 6px 12px; font-size: 12px;
      cursor: pointer; font-family: Cairo, sans-serif;
      transition: all 0.2s;
    }
    .guider-choice:hover { background: #2c1a0e; color: #fff; }
    #guider-input-row {
      padding: 12px 16px; border-top: 1px solid #eee;
      display: flex; gap: 8px; background: #fff;
    }
    #guider-input {
      flex: 1; border: 1.5px solid #e0d9ce; border-radius: 10px;
      padding: 10px 12px; font-family: Cairo, sans-serif;
      font-size: 13px; outline: none; direction: rtl;
    }
    #guider-input:focus { border-color: #2c1a0e; }
    #guider-send {
      background: #2c1a0e; color: #fff; border: none;
      border-radius: 10px; padding: 10px 16px;
      font-family: Cairo, sans-serif; font-size: 13px;
      font-weight: 700; cursor: pointer;
    }
    @keyframes guiderFloat {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
  `;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML('beforeend', `
    <div id="guider-fab">
      <div id="guider-bubble">☕ ساعدني أختار قهوتي!</div>
      <button id="guider-btn">☕</button>
    </div>
    <div id="guider-widget">
      <div id="guider-header">
        <div>
          <div id="guider-header-title">أحمد — باريستا دريب اون</div>
          <div id="guider-header-sub">اسألني عن أي قهوة</div>
        </div>
        <button id="guider-close">✕</button>
      </div>
      <div id="guider-messages"></div>
      <div id="guider-input-row">
        <button id="guider-send">إرسال</button>
        <input id="guider-input" placeholder="اكتب هنا..." />
      </div>
    </div>
  `);

  const widget = document.getElementById('guider-widget');
  const messagesEl = document.getElementById('guider-messages');
  const input = document.getElementById('guider-input');

  function parseChoices(text) {
    const match = text.match(/CHOICES:\s*(\[.+?\])+/);
    if (!match) return { text, choices: [] };
    const choices = [...text.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
    const cleanText = text.replace(/CHOICES:.*$/s, '').trim();
    return { text: cleanText, choices };
  }

  function addMessage(text, role) {
    const { text: cleanText, choices } = parseChoices(text);
    const div = document.createElement('div');
    div.className = role === 'assistant' ? 'guider-msg-ai' : 'guider-msg-user';
    div.textContent = cleanText;
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

    const typing = document.createElement('div');
    typing.className = 'guider-msg-ai';
    typing.textContent = '...';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const res = await fetch(`${API}/api/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
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
    if (messages.length === 0) {
      setTimeout(() => {
        const welcome = 'هلا! انا احمد من دريب اون — تحتاج مساعدة تختار قهوتك؟\nCHOICES: [أيوه ساعدني 😊] [بتفرج بس 👀]';
        addMessage(welcome, 'assistant');
        messages.push({ role: 'assistant', content: welcome });
      }, 300);
    }
  }

  document.getElementById('guider-btn').onclick = openWidget;
  document.getElementById('guider-close').onclick = () => widget.classList.remove('open');
  document.getElementById('guider-send').onclick = () => sendMessage();
  input.onkeypress = e => { if (e.key === 'Enter') sendMessage(); };
})();
