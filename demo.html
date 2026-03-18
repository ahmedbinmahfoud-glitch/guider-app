<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Guider — دريب اون</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      direction: ltr;
    }
    #guider-widget {
      width: 390px;
      height: 580px;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      direction: ltr;
    }
    #guider-header {
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      color: #fff;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      direction: ltr;
    }
    #guider-header .avatar {
      width: 42px;
      height: 42px;
      background: #e8c96d;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    #guider-header .info h3 { font-size: 15px; }
    #guider-header .info p { font-size: 11px; opacity: 0.7; margin-top: 2px; }
    #guider-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      direction: ltr;
    }
    /* Bot messages — RIGHT side */
    .msg-bot-wrap {
      display: flex;
      justify-content: flex-end;
    }
    .msg-bot-wrap .msg {
      background: #f0f0f0;
      color: #1a1a2e;
      border-radius: 18px 18px 4px 18px;
      text-align: right;
      direction: rtl;
    }
    /* User messages — LEFT side */
    .msg-user-wrap {
      display: flex;
      justify-content: flex-start;
    }
    .msg-user-wrap .msg {
      background: #1a1a2e;
      color: #fff;
      border-radius: 18px 18px 18px 4px;
      text-align: right;
      direction: rtl;
    }
    .msg {
      max-width: 82%;
      padding: 10px 14px;
      font-size: 14px;
      line-height: 1.6;
    }
    /* Choices */
    .choices-wrap {
      display: flex;
      justify-content: flex-end;
    }
    .choices-inner {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      max-width: 85%;
      justify-content: flex-end;
    }
    .choice-btn {
      background: #fff;
      border: 1.5px solid #1a1a2e;
      color: #1a1a2e;
      border-radius: 20px;
      padding: 7px 14px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
      direction: rtl;
    }
    .choice-btn:hover { background: #1a1a2e; color: #fff; }
    .choice-btn:disabled { opacity: 0.4; cursor: default; }
    /* Typing */
    .typing-wrap { display: flex; justify-content: flex-end; }
    .typing {
      display: flex;
      gap: 4px;
      padding: 10px 14px;
      background: #f0f0f0;
      border-radius: 18px 18px 4px 18px;
    }
    .typing span {
      width: 7px; height: 7px;
      background: #999;
      border-radius: 50%;
      animation: bounce 1s infinite;
    }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-5px); }
    }
    #guider-input-area {
      padding: 12px 16px;
      border-top: 1px solid #eee;
      display: flex;
      gap: 8px;
      align-items: center;
      direction: ltr;
    }
    #guider-input {
      flex: 1;
      border: 1.5px solid #ddd;
      border-radius: 24px;
      padding: 10px 16px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      direction: rtl;
      text-align: right;
    }
    #guider-input:focus { border-color: #1a1a2e; }
    #guider-send {
      width: 42px; height: 42px;
      background: #1a1a2e;
      border: none;
      border-radius: 50%;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s;
    }
    #guider-send:hover { background: #e8c96d; color: #1a1a2e; }
  </style>
</head>
<body>
<div id="guider-widget">
  <div id="guider-header">
    <div class="avatar">🤖</div>
    <div class="info">
      <h3>أحمد | دريب اون</h3>
      <p>مساعدك لاختيار قهوتك المثالية</p>
    </div>
  </div>
  <div id="guider-messages"></div>
  <div id="guider-input-area">
    <button id="guider-send">➤</button>
    <input id="guider-input" type="text" placeholder="اكتب رسالتك..." />
  </div>
</div>

<script>
  const BACKEND_URL = 'https://guider-app.vercel.app/api/index';
  const messages = [];
  const messagesEl = document.getElementById('guider-messages');
  const inputEl = document.getElementById('guider-input');

  function parseChoices(text) {
    const match = text.match(/CHOICES:\s*((?:\[.+?\]\s*)+)/);
    if (!match) return { text, choices: [] };
    const choices = [...match[1].matchAll(/\[(.+?)\]/g)].map(m => m[1]);
    const cleanText = text.replace(/CHOICES:\s*(?:\[.+?\]\s*)+/, '').trim();
    return { text: cleanText, choices };
  }

  function disableAllChoices() {
    document.querySelectorAll('.choice-btn').forEach(btn => btn.disabled = true);
  }

  function addBotMessage(rawText) {
    const { text, choices } = parseChoices(rawText);
    const wrap = document.createElement('div');
    wrap.className = 'msg-bot-wrap';
    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.textContent = text;
    wrap.appendChild(msg);
    messagesEl.appendChild(wrap);

    if (choices.length > 0) {
      const choicesWrap = document.createElement('div');
      choicesWrap.className = 'choices-wrap';
      const inner = document.createElement('div');
      inner.className = 'choices-inner';
      choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = choice;
        btn.addEventListener('click', () => {
          disableAllChoices();
          addUserMessage(choice);
          sendToBackend(choice);
        });
        inner.appendChild(btn);
      });
      choicesWrap.appendChild(inner);
      messagesEl.appendChild(choicesWrap);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addUserMessage(text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-user-wrap';
    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.textContent = text;
    wrap.appendChild(msg);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'typing-wrap';
    wrap.id = 'typing-indicator';
    wrap.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('typing-indicator');
    if (t) t.remove();
  }

  async function sendToBackend(text) {
    messages.push({ role: 'user', content: text });
    showTyping();
    try {
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      const data = await res.json();
      removeTyping();
      const reply = data.reply || 'عذراً، حدث خطأ.';
      addBotMessage(reply);
      messages.push({ role: 'assistant', content: reply });
    } catch (err) {
      removeTyping();
      addBotMessage('في مشكلة تقنية، حاول مجدداً.');
    }
  }

  document.getElementById('guider-send').addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    disableAllChoices();
    addUserMessage(text);
    sendToBackend(text);
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('guider-send').click();
  });

  // Opening message from backend
  window.onload = async () => {
    showTyping();
    try {
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'ابدأ المحادثة بالترحيب' }] })
      });
      const data = await res.json();
      removeTyping();
      const greeting = data.reply || 'هلا! أنا أحمد من دريب اون — تحتاج مساعدة تختار قهوتك؟';
      addBotMessage(greeting);
      messages.push({ role: 'assistant', content: greeting });
    } catch (err) {
      removeTyping();
      addBotMessage('هلا! أنا أحمد من دريب اون — تحتاج مساعدة تختار قهوتك؟');
    }
  };
</script>
</body>
</html>
