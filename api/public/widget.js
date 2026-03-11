(function() {
  const GUIDER_API = 'https://guider-app.vercel.app';
  const store_id = window.GUIDER_STORE_ID;
  if (!store_id) return;

  let products = [];
  let messages = [];
  let isOpen = false;

  // جلب المنتجات
  fetch(`${GUIDER_API}/api/products/${store_id}`)
    .then(r => r.json())
    .then(data => { products = data.products || []; });

  // إنشاء الـ Widget
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
      background: linear-gradient(135deg, #ff4500, #ff6a00);
      border: none; font-size: 26px; cursor: pointer;
      box-shadow: 0 6px 24px rgba(255,69,0,0.4);
      transition: transform 0.2s;
    }
    #guider-btn:hover { transform: scale(1.08); }
    #guider-widget {
      position: fixed; bottom: 100px; left: 24px;
      width: 360px; max-height: 520px;
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
      border-radius: 4px 14px 14px 14px;
      font-size: 13px; line-height: 1.6;
    }
    .guider-msg-ai {
      background: #fff; border: 1px solid #e8e2d9;
      color: #1a1a1a; align-self: flex-start;
    }
    .guider-msg-user {
      background: #ff4500; color: #fff;
      border-radius: 14px 4px 14px 14px;
      align-self: flex-end;
    }
    #guider-input-row {
      padding: 12px 16px; border-top: 1px solid #eee;
      display: flex; gap: 8px; background: #fff;
    }
    #guider-input {
      flex: 1; border: 1.5px solid #e0d9ce; border-radius: 10px;
      padding: 10px 12px; font-family: Cairo, sans-serif;
      font-size: 13px; outline: none; direction: rtl;
    }
    #guider-input:focus { border-color: #ff4500; }
    #guider-send {
      background: #ff4500; color: #fff; border: none;
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

  // HTML
  document.body.insertAdjacentHTML('beforeend', `
    <div id="guider-fab">
      <div id="guider-bubble">👋 محتاج مساعدة في الاختيار؟</div>
      <button id="guider-btn">🤖</button>
    </div>
    <div id="guider-widget">
      <div id="guider-header">
        <div>
          <div id="guider-header-title">🤖 Guider — مساعدك الذكي</div>
          <div id="guider-header-sub">اسألني عن أي منتج</div>
        </div>
        <button id="guider-close">✕</button>
      </div>
      <div id="guider-messages"></div>
      <div id="guider-input-row">
        <button id="guider-send">إرسال</button>
        <input id="guider-input" placeholder="اكتب سؤالك هنا..." />
      </div>
    </div>
  `);

  const widget = document.getElementById('guider-widget');
  const messagesEl = document.getElementById('guider-messages');
  const input = document.getElementById('guider-input');

  function addMessage(text, role) {
    const div = document.createElement('div');
    div.className = role === 'assistant' ? 'guider-msg-ai' : 'guider-msg-user';
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage(text, 'user');
    messages.push({ role: 'user', content: text });

    addMessage('...', 'assistant');

    const res = await fetch(`${GUIDER_API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id, messages, products })
    });
    const data = await res.json();
    messagesEl.lastChild.remove();
    addMessage(data.reply, 'assistant');
    messages.push({ role: 'assistant', content: data.reply });
  }

  // أول رسالة
  function openWidget() {
    widget.classList.add('open');
    if (messages.length === 0) {
      setTimeout(() => {
        addMessage('مرحباً! 👋 أنا Guider مساعدك الذكي. أخبرني وش تبحث عنه وأوصلك للمنتج المناسب بالضبط!', 'assistant');
        messages.push({ role: 'assistant', content: 'مرحباً! 👋 أنا Guider مساعدك الذكي. أخبرني وش تبحث عنه وأوصلك للمنتج المناسب بالضبط!' });
      }, 300);
    }
  }

  document.getElementById('guider-btn').onclick = openWidget;
  document.getElementById('guider-close').onclick = () => widget.classList.remove('open');
  document.getElementById('guider-send').onclick = sendMessage;
  input.onkeypress = e => { if (e.key === 'Enter') sendMessage(); };
})();
