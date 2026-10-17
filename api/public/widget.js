// ============================================================
// widget.js — Guider storefront widget for Salla stores.
// ============================================================
(function() {
  // Talk to the deployment that served this file, so a preview build of the
  // widget calls the preview API instead of production.
  const API = (function() {
    try {
      const src = document.currentScript && document.currentScript.src;
      // Only our own Vercel deployments; a CDN copy must still hit production.
      if (src && /^guider-[\w-]+\.vercel\.app$/.test(new URL(src).hostname)) return new URL(src).origin;
    } catch (e) {}
    return 'https://guider-app.vercel.app';
  })();
  let messages = [];

  // One visitor = one session for 30 days, across tabs and visits, so an
  // order placed days after the chat can still be attributed to it.
  const SESSION_KEY = 'guider_session';
  const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  function newSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  }
  let sessionId;
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (saved && saved.id && Date.now() - saved.ts < SESSION_TTL_MS) {
      sessionId = saved.id;
    } else {
      sessionId = sessionStorage.getItem('guider_sid') || newSessionId();
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: sessionId, ts: Date.now() }));
  } catch (e) {
    sessionId = newSessionId();
  }

  // Visit source for marketing analysis: the first and the latest external
  // touch of this session (UTM tags, ad click id type, referring domain only,
  // landing path). Runs on every page, including those where the chat is
  // hidden, because ads often land on product pages. Sent once with the first
  // chat message; nothing personal is read.
  const TOUCH_KEY = 'guider_touch';
  function currentTouch() {
    const q = new URLSearchParams(location.search);
    const t = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function(k) {
      const v = q.get(k); if (v) t[k] = v.slice(0, 100);
    });
    const click = q.get('fbclid') ? 'meta' : (q.get('gclid') || q.get('gbraid') || q.get('wbraid')) ? 'google'
      : q.get('ttclid') ? 'tiktok' : (q.get('ScCid') || q.get('sccid')) ? 'snap' : q.get('twclid') ? 'x' : null;
    if (click) t.click_id = click;
    let ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    const internal = ref === location.hostname;
    if (ref && !internal) t.referrer = ref;
    if (!Object.keys(t).length) return internal ? null : { direct: true, landing_path: location.pathname.slice(0, 200), at: Date.now() };
    t.landing_path = location.pathname.slice(0, 200);
    t.at = Date.now();
    return t;
  }
  let touch = { session: sessionId };
  try {
    const saved = JSON.parse(localStorage.getItem(TOUCH_KEY) || 'null');
    if (saved && saved.session === sessionId) touch = saved;
    const now = currentTouch();
    if (now && !(now.direct && touch.first)) {
      if (!touch.first) touch.first = now;
      if (!now.direct) touch.last = now;
    }
    localStorage.setItem(TOUCH_KEY, JSON.stringify(touch));
  } catch (e) {}
  let contextSent = false;
  function visitContext() {
    if (contextSent) return undefined;
    let mobile = false;
    try { mobile = /Mobi|Android|iPhone/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px)').matches; } catch (e) {}
    return { first: touch.first || null, last: touch.last || null, device: mobile ? 'mobile' : 'desktop', chat_path: location.pathname.slice(0, 200) };
  }

  // Report the logged-in Salla customer for this session. Runs on every page,
  // including checkout and thank-you where the chat itself is hidden.
  // Salla populates user.id for guests too, so only a non-guest id counts.
  // The storefront SDK may load after this script: wait for salla.onReady,
  // or poll briefly if the SDK isn't on the page yet.
  // The first name is sent with each chat request so the bot can greet a
  // logged-in customer by name; the server never stores it.
  let firstName = null;
  function identifyCustomer() {
    let customerId = null;
    try {
      const cfg = window.salla.config;
      const guest = typeof cfg.isGuest === 'function' ? cfg.isGuest() : true;
      if (!guest) {
        customerId = cfg.get('user.id');
        const name = cfg.get('user.first_name') || cfg.get('user.name') || '';
        firstName = String(name).trim().split(/\s+/)[0] || null;
      }
    } catch (e) {}
    if (!customerId) return;
    const key = 'guider_identified_' + sessionId + '_' + customerId;
    try { if (sessionStorage.getItem(key)) return; } catch (e) {}
    fetch(API + '/api/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, customerId: String(customerId) }),
      keepalive: true
    }).then(function(r) {
      if (r.ok) { try { sessionStorage.setItem(key, '1'); } catch (e) {} }
    }).catch(function() {});
  }
  (function waitForSalla(attempt) {
    if (window.salla && typeof window.salla.onReady === 'function') {
      window.salla.onReady(identifyCustomer);
    } else if (attempt < 20) {
      setTimeout(function() { waitForSalla(attempt + 1); }, 500);
    }
  })(0);

  // ============================================
  // URL EXCLUSION — Don't show widget on these pages
  // ============================================
  const EXCLUDED_URL_PATTERNS = [
    /\/p\d+/i,           // Product detail pages (Salla: /xxx/p1234567)
    /\/cart/i,           // Cart page
    /\/checkout/i,       // Checkout
    /\/orders?\b/i,      // Order pages
    /\/thank/i,          // Thank you / confirmation pages
    /\/account/i,        // User account
    /\/profile/i,        // User profile
    /\/dashboard/i,      // User dashboard
    /\/login/i,          // Login
    /\/register/i,       // Register
    /\/signup/i,         // Signup
    /\/auth/i,           // Auth pages
    /\/my-orders/i,      // My orders
    /\/wishlist/i,       // Wishlist
    /\/invoice/i,        // Invoice
    /\/track/i,          // Order tracking
  ];

  function shouldHideWidget() {
    const path = window.location.pathname;
    return EXCLUDED_URL_PATTERNS.some(pattern => pattern.test(path));
  }

  // ============================================
  // DISMISS COOLDOWN — Respect user's choice to close
  // ============================================
  const DISMISS_KEY = 'guider_dismissed_at';
  const COOLDOWN_HOURS = 24;

  function isInCooldown() {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (!dismissed) return false;
      const dismissedTime = parseInt(dismissed, 10);
      if (isNaN(dismissedTime)) return false;
      const hoursSince = (Date.now() - dismissedTime) / (1000 * 60 * 60);
      return hoursSince < COOLDOWN_HOURS;
    } catch (e) {
      return false;
    }
  }

  function recordDismissal() {
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch (e) {}
  }

  // EARLY EXIT — Don't initialize if not needed
  if (shouldHideWidget() || isInCooldown()) {
    return;
  }

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
    #guider-bubble-wrap {
      position: relative;
      display: inline-flex;
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
    #guider-bubble-close {
      position: absolute;
      top: -8px; left: -8px;
      width: 24px; height: 24px;
      border-radius: 50%;
      background: #c8a96e;
      color: #0d1f3c;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      transition: transform 0.2s, background 0.2s;
      padding: 0;
      line-height: 1;
      z-index: 2;
    }
    #guider-bubble-close:hover {
      transform: scale(1.15);
      background: #d4b87a;
    }
    #guider-fab.hidden {
      opacity: 0; transform: translateY(10px); pointer-events: none;
    }
    #guider-bubble.hidden {
      opacity: 0; pointer-events: none;
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
      max-height: calc(100dvh - 140px);
      background: #fff; border-radius: 20px;
      box-shadow: 0 20px 60px rgba(13,31,60,0.3);
      z-index: 9998; display: none; flex-direction: column;
      font-family: 'Cairo', sans-serif; overflow: hidden;
      direction: rtl;
    }
    #guider-widget.open { display: flex; }

    @media (max-width: 480px) {
      #guider-widget {
        width: calc(100vw - 24px);
        left: 12px; right: 12px;
        bottom: 12px;
        height: calc(100dvh - 24px);
        max-height: calc(100dvh - 24px);
      }
      #guider-fab { left: 12px; bottom: 12px; }
      #guider-bubble { max-width: 180px; font-size: 12px; }
    }

    #guider-header {
      background: linear-gradient(135deg, #081529, #0d1f3c);
      padding: 18px 22px; color: #fff;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #c8a96e;
      flex-shrink: 0;
    }
    #guider-header-title { font-size: 16px; font-weight: 700; color: #fff; }
    #guider-header-sub { font-size: 12px; opacity: 0.75; margin-top: 3px; color: #c8a96e; }
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
      -webkit-overflow-scrolling: touch;
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

    .guider-msg-ai strong { color: #0d1f3c; font-weight: 800; }
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
    .guider-msg-ai .guider-link[href*="wa.me"] {
      background: #25d366; color: #fff; border-color: #25d366;
    }
    .guider-msg-ai .guider-link[href*="wa.me"]:hover {
      background: #1da851; border-color: #1da851;
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
    .guider-cart { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 10px; }
    .guider-cart .guider-checkout { background: #0d1f3c; color: #fff; }
    .guider-cart .guider-choice:disabled { opacity: 0.7; cursor: default; transform: none; }
    .guider-choice:hover {
      background: #0d1f3c; color: #fff;
      transform: translateY(-1px);
    }

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
      padding: 14px 16px;
      border-top: 1px solid #e0dbd0;
      display: flex; gap: 8px; background: #fff;
      flex-shrink: 0;
    }
    #guider-input {
      flex: 1; border: 1.5px solid #e0d9ce; border-radius: 12px;
      padding: 11px 14px; font-family: 'Cairo', sans-serif;
      font-size: 16px; outline: none; direction: rtl;
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
      <div id="guider-bubble-wrap">
        <button id="guider-bubble-close" aria-label="إخفاء">✕</button>
        <div id="guider-bubble">☕ خلني أرشّحلك قهوتك</div>
      </div>
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
  const fab = document.getElementById('guider-fab');
  const bubble = document.getElementById('guider-bubble');
  const bubbleClose = document.getElementById('guider-bubble-close');
  const messagesEl = document.getElementById('guider-messages');
  const input = document.getElementById('guider-input');

  function renderMarkdown(text) {
    let html = text;
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="guider-link">$1</a>'
    );
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function parseChoices(text) {
    const choicesIndex = text.indexOf('CHOICES:');
    if (choicesIndex === -1) return { text, choices: [] };
    const messageText = text.substring(0, choicesIndex).trim();
    const choicesPart = text.substring(choicesIndex);
    const choices = [...choicesPart.matchAll(/\[([^\]]+)\](?!\()/g)].map(m => m[1]);
    return { text: messageText, choices };
  }

  // Cart button (only when the server enables it for this session): one
  // "add" button per product linked in the reply, then a checkout button.
  function logCart(action, productId) {
    try {
      fetch(API + '/api/cart-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ sessionId: sessionId, productId: productId || null, action: action })
      }).catch(function() {});
    } catch (e) {}
  }

  function cartUrl() {
    let base = '';
    try { base = window.salla.config.get('store.url') || ''; } catch (e) {}
    if (!base) base = location.origin + '/';
    return base.replace(/\/?$/, '/') + 'cart';
  }

  function addCartButtons(text) {
    const sallaCart = window.salla && window.salla.cart;
    if (!sallaCart || typeof sallaCart.addItem !== 'function') return;
    const seen = {}, items = [];
    for (const m of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      const id = (m[2].match(/\/p(\d+)(?:[\/?#]|$)/) || [])[1];
      if (!id || seen[id] || items.length >= 3) continue;
      seen[id] = true;
      items.push({ id: id, name: m[1].replace(/\*/g, '').trim(), href: m[2] });
    }
    if (!items.length) return;
    const row = document.createElement('div');
    row.className = 'guider-cart';
    let checkout = null;
    items.forEach(function(it) {
      const btn = document.createElement('button');
      btn.className = 'guider-choice';
      const label = '🛒 أضف ' + (it.name.length > 26 ? it.name.slice(0, 26) + '…' : it.name);
      btn.textContent = label;
      btn.onclick = function() {
        btn.disabled = true;
        btn.textContent = '...';
        Promise.resolve(sallaCart.addItem({ id: Number(it.id), quantity: 1 })).then(function() {
          btn.textContent = '✓ انضاف للسلة';
          logCart('add', it.id);
          if (!checkout) {
            checkout = document.createElement('button');
            checkout.className = 'guider-choice guider-checkout';
            checkout.textContent = 'إتمام الطلب ←';
            checkout.onclick = function() { logCart('checkout'); window.location.href = cartUrl(); };
            row.appendChild(checkout);
          }
        }).catch(function() {
          // e.g. the product needs an option chosen on its page
          btn.disabled = false;
          btn.textContent = label;
          logCart('add_failed', it.id);
          window.open(it.href, '_blank', 'noopener');
        });
      };
      row.appendChild(btn);
    });
    messagesEl.appendChild(row);
  }

  function addMessage(text, role, opts) {
    const { text: cleanText, choices } = parseChoices(text);
    const div = document.createElement('div');
    div.className = role === 'assistant' ? 'guider-msg-ai' : 'guider-msg-user';

    if (role === 'assistant') {
      div.innerHTML = renderMarkdown(cleanText);
    } else {
      div.textContent = cleanText;
    }
    messagesEl.appendChild(div);
    if (role === 'assistant' && opts && opts.cart) addCartButtons(cleanText);

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
    typing.className = 'guider-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const res = await fetch(`${API}/api/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, sessionId, firstName, stream: true, ctx: visitContext() })
      });
      if (res.ok) contextSent = true;
      const type = res.headers.get('content-type') || '';
      let data;
      if (type.indexOf('ndjson') !== -1 && res.body && res.body.getReader) {
        data = await readStream(res, typing);
      } else {
        data = await res.json();
      }
      const reply = data && data.reply;
      if (!reply) throw new Error('no reply');
      typing.remove();
      addMessage(reply, 'assistant', { cart: !!data.cart });
      messages.push({ role: 'assistant', content: reply });
    } catch(e) {
      typing.remove();
      const live = messagesEl.querySelector('.guider-msg-ai.guider-live');
      if (live) live.remove();
      addMessage('صار خطأ، جرب مرة ثانية', 'assistant');
    }
  }

  // Streamed reply: lines appear as the bot writes them; the final reply
  // (with its buttons) replaces them when it arrives.
  async function readStream(res, typing) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', lines = [], live = null, reply = null;
    function show() {
      if (!live) {
        typing.remove();
        live = document.createElement('div');
        live.className = 'guider-msg-ai guider-live';
        messagesEl.appendChild(live);
      }
      live.innerHTML = renderMarkdown(lines.join('\n'));
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!raw.trim()) continue;
        let ev; try { ev = JSON.parse(raw); } catch (e) { continue; }
        if (ev.t === 'line') { lines.push(ev.text); show(); }
        else if (ev.t === 'reset') { lines = []; if (live) live.innerHTML = ''; }
        else if (ev.t === 'done') reply = ev;
      }
      if (reply) break;
    }
    if (live) live.remove();
    return reply;
  }

  function openWidget() {
    widget.classList.add('open');
    fab.classList.add('hidden');

    if (typeof gtag !== 'undefined') {
      gtag('event', 'guider_opened', {
        event_category: 'Guider',
        event_label: 'Widget Opened'
      });
    }

    if (messages.length === 0) {
      setTimeout(() => {
        const welcome = 'مرحباً! كيف تحب قهوتك اليوم؟\nCHOICES: [مع الحليب 🥛] [إسبريسو بلاك ☕] [فلتر V60 🫗] [بارد ❄️] [ما أعرف 🤷]';
        addMessage(welcome, 'assistant');
        messages.push({ role: 'assistant', content: welcome });
      }, 300);
    }

    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 400);
  }

  function closeWidget() {
    widget.classList.remove('open');
  }

  function dismissBubblePermanently() {
    recordDismissal();
    fab.classList.add('hidden');
    setTimeout(() => {
      fab.style.display = 'none';
    }, 300);
  }

  // Mobile keyboard fix
  input.addEventListener('focus', () => {
    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 300);
  });

  bubble.onclick = openWidget;
  bubbleClose.onclick = (e) => {
    e.stopPropagation();
    dismissBubblePermanently();
  };
  document.getElementById('guider-btn').onclick = openWidget;
  document.getElementById('guider-close').onclick = closeWidget;
  document.getElementById('guider-send').onclick = () => sendMessage();
  input.onkeypress = e => { if (e.key === 'Enter') sendMessage(); };
})();
