const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Minimal PostgREST client. Returns { ok, status, data } and never throws.
function sb(method, pathAndQuery, body, prefer) {
  return new Promise((resolve) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return resolve({ ok: false, status: 0, data: null });
    const url = new URL(`${SUPABASE_URL}/rest/v1${pathAndQuery}`);
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept': 'application/json'
    };
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
      headers['Prefer'] = prefer || 'return=minimal';
    }
    const req = https.request({ hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search, method, headers }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let data = raw;
        try { data = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ ok: res.statusCode < 300, status: res.statusCode, data });
      });
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, data: err.message }));
    if (payload !== null) req.write(payload);
    req.end();
  });
}

// ============================================
// PROMOTIONS — single source of truth for every active discount.
// The 15% kilo campaign ended; kilo prices are full price (confirmed 2026-10-08).
// ============================================
const PROMOTIONS = {
  KILO_DISCOUNT: { active: false, percent: 15 },
  // No discount code is active (confirmed 2026-10-08); D10 ended.
  ACTIVE_CODES: []
};

// Out of stock or discontinued: never recommend, never link.
const OUT_OF_STOCK = [
  'يرقاتشيف', 'قوجي كورما', 'خوخ إندونيسي', 'تروبيكال', 'يلوفروت',
  'فيمتو', 'ريماسيلا', 'كوكونت ليمونيد', 'بكج الإثيوبيات الفاكهي'
];

// Out-of-stock beans that DO have an in-stock drip bag
const BAG_RESCUE = {
  'تروبيكال': { bag: 'ظرف تروبيكال', price: 40, exact: true },
  'كوكونت ليمونيد': { bag: 'ظرف كوكونت ليمونيد', price: 41, exact: true }
};

// Salla redirects /ar/product/p<id> to the product's canonical page.
// (The old /ar/?product_id=<id> form lands on the home page.)
const P = id => 'https://driponcoffeesa.com/ar/product/p' + id;

// Active sizes per bean, from the store export of 2026-10-08.
// Flavour-named beans are keyed "<name> لاهوائي" so a tasting note
// (e.g. "توت" or "فراولة" inside another bean's notes) never gets linked.
const BEAN_LINKS = {
  'أكيا': { '125': P(179239006), '250': P(550675919), '1000': P(1639093607) },
  'هامبيلا': { '125': P(1189786475), '250': P(884098473), '1000': P(1109773747) },
  'شيلشيلي': { '125': P(1375643944), '250': P(573186918), '1000': P(995304007) },
  'كايا': { '125': P(751463166), '250': P(2123401727), '1000': P(1948767994) },
  'سفاري': { '125': P(1438362571), '250': P(1653968361), '1000': P(2105374193) },
  'أوراقا': { '250': P(217530968) },
  'هاسيندا': { '125': P(1544794708), '250': P(1077689058), '1000': P(109623881) },
  'بليند': { '125': P(676285314), '250': P(805711755), '1000': P(1021371370) },
  'فيلا سيبرس': { '125': P(1342313896), '250': P(810496020), '1000': P(1013342392) },
  'حراز لاهوائي': { '125': P(1132798178), '250': P(1309456195), '1000': P(1490403147) },
  'حراز': { '125': P(597219964), '250': P(928636193), '1000': P(494621956) },
  'كالداس': { '125': P(1982513029), '250': P(1616996217), '1000': P(1732360125) },
  'كاستيلو': { '125': P(2090810317), '250': P(1315199694), '1000': P(1781504200) },
  'روينزوري': { '125': P(461345204), '250': P(2131201335), '1000': P(1611659413) },
  'ماناناسي': { '125': P(917455515), '250': P(514090908), '1000': P(40463200) },
  'ريناسير': { '125': P(1347604335), '250': P(574615144), '1000': P(1239493738) },
  'شوكو لاهوائي': { '125': P(1818139739), '250': P(617209053), '1000': P(682011405) },
  'ديكاف': { '125': P(802506925), '250': P(1860792230), '1000': P(1435551065) },
  'هوليستن': { '125': P(436985654), '250': P(853914068), '1000': P(385570447) },
  'كوتون كاندي': { '125': P(873953855), '250': P(429963774) },
  'ريد فروت': { '125': P(1302026197), '250': P(385894034), '1000': P(163951245) },
  'باشن فروت': { '125': P(2080600309), '250': P(1906499867), '1000': P(1903029223) },
  'جوز الهند لاهوائي': { '125': P(1412954247), '250': P(954527786), '1000': P(1829208895) },
  'حبحب لاهوائي': { '125': P(1082464268), '250': P(1961519208), '1000': P(308422413) },
  'عنب لاهوائي': { '125': P(1940452031), '250': P(938446689), '1000': P(566481854) },
  'خوخ لاهوائي': { '125': P(1931162634), '250': P(415678470), '1000': P(1398968884) },
  'توت لاهوائي': { '125': P(565629273), '250': P(242582606), '1000': P(1760243738) },
  'فراولة لاهوائي': { '125': P(334042308), '250': P(1066619590), '1000': P(1531351232) },
  'الخلطة الملكية': { '250': P(462737608) },
  'خلطة السلطان': { '250': P(1767920429) }
};

const OTHER_LINKS = {
  'بكج التذوق A': P(1505204168),
  'بكج التذوق B': P(1787882946),
  'بكج الموهيتو': P(177420306),
  'بكج الفواكه الصيفية': P(1851643985),
  'بكج المحاصيل الفاخرة': P(2475317),
  'بكج الإثيوبيات الكلاسيكي': P(1197625313),
  'بكج V60': P(1312476048),
  'بكج اسبريسو و V60': P(1668503197),
  'كوب جدة': P(902891861),
  'أكواب اليوم الوطني': P(506534380),
  'أكواب ورقية': P(1202439196)
};

const BAG_LINKS = {
  'ظرف هامبيلا': P(810532892),
  'ظرف شيلشيلي': P(1651658047),
  'ظرف أكيا': P(420311809),
  'ظرف شوكو': P(1618673421),
  'ظرف فيلا سيبرس': P(344293906),
  'ظرف حراز': P(519382295),
  'ظرف روينزوري': P(1294468630),
  'ظرف ماناناسي': P(843521550),
  'ظرف ريفنسيلا': P(1758610448),
  'ظرف تروبيكال': P(129296388),
  'ظرف ديكاف': P(237341497),
  'ظرف كالداس': P(1469692171),
  'ظرف كوكونت ليمونيد': P(1152430339)
};

// Longest names first so "حراز لاهوائي" wins over "حراز"
function sortedKeys(obj) {
  return Object.keys(obj).sort((a, b) => b.length - a.length);
}

// Turns product names in Claude's reply into real links.
// Claude never writes URLs, so it can never invent one.
function injectProductLinks(text) {
  if (!text) return text;
  const cut = text.indexOf('CHOICES:');
  let body = cut === -1 ? text : text.slice(0, cut);
  const tail = cut === -1 ? '' : text.slice(cut);
  const used = new Set();

  function linkOnce(name, url) {
    if (!url || used.has(url)) return;
    const i = body.indexOf(name);
    if (i === -1) return;
    const before = body.slice(0, i);
    const opens = (before.match(/\[/g) || []).length;
    const closes = (before.match(/\]/g) || []).length;
    if (opens > closes) return;
    body = before + '[' + name + '](' + url + ')' + body.slice(i + name.length);
    used.add(url);
  }

  for (const name of sortedKeys(BAG_LINKS)) linkOnce(name, BAG_LINKS[name]);
  for (const name of sortedKeys(OTHER_LINKS)) linkOnce(name, OTHER_LINKS[name]);
  for (const bean of sortedKeys(BEAN_LINKS)) {
    if (OUT_OF_STOCK.some(o => o === bean)) continue;
    if (!body.includes(bean)) continue;
    const sizes = BEAN_LINKS[bean];
    // Each size is its own product. Link 250 g unless the reply only talks
    // about the kilo or only about 125 g.
    const has250 = /٢٥٠|250/.test(body), hasKilo = /كيلو|١٠٠٠|1000/.test(body);
    let size = '250';
    if (hasKilo && !has250 && sizes['1000']) size = '1000';
    else if (/١٢٥|125/.test(body) && !has250 && !hasKilo && sizes['125']) size = '125';
    linkOnce(bean, sizes[size] || sizes['250'] || Object.values(sizes)[0]);
  }
  return body + tail;
}

// Removes product links, keeping the name. Applied to the history sent to
// Claude (it otherwise copies the link format and invents product ids) and to
// Claude's reply, so the only product links are the ones injected above.
function stripStoreLinks(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\[([^\]]+)\]\(https?:\/\/(?:www\.)?driponcoffeesa\.com[^)]*\)/g, '$1');
}

// ---------- Catalog tools (Block 1) ----------
// Stores listed in TOOLS_STORES answer from the synced products table through
// search_products instead of the hardcoded prompt catalog. Unset in
// production until a store passes the regression set; set on Preview to test.
const { createCatalog, collectUrls, keepAllowedLinks } = require('../lib/catalog');
const { enforceSaudi } = require('../lib/dialect');
const { buildPromptV8 } = require('../lib/prompt');
const { createMemory } = require('../lib/memory');
const memory = createMemory((...a) => sb(...a), { backfill: (...a) => backfillCustomerOrders(...a) });

// Prompt v8: a store with a store_config row gets the generic prompt filled
// from that row; others in tool mode fall back to prompt v7 minus its catalog.
const promptCache = new Map(); // storeId -> { at, prompt }
async function toolPromptFor(storeId) {
  const hit = promptCache.get(storeId);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.prompt;
  const r = await sb('GET', `/store_config?select=persona,rules&store_id=eq.${encodeURIComponent(storeId)}`);
  if (!r.ok) console.error('store_config load failed:', r.status);
  if (!(r.ok && Array.isArray(r.data) && r.data[0])) return hit ? hit.prompt : TOOL_SYSTEM_PROMPT;
  const prompt = buildPromptV8(r.data[0]);
  promptCache.set(storeId, { at: Date.now(), prompt });
  return prompt;
}
const catalog = createCatalog((...a) => sb(...a));
// Cart button (Block 4). CART_STORES: stores where it runs as a 50/50 test
// per session; CART_TEST_CUSTOMERS: Salla customer ids that always get it
// (owner testing on a live store before launch); CART_ALL_STORES: on for every
// session (no holdout). Returns 'all', 'cart', 'control', 'test' or null.
function envList(name) {
  return (process.env[name] || '').split(',').map(x => x.trim()).filter(Boolean);
}
function cartArm(storeId, sessionId, customerId) {
  if (customerId && envList('CART_TEST_CUSTOMERS').includes(String(customerId))) return 'test';
  if (envList('CART_ALL_STORES').includes(String(storeId))) return 'all';
  if (!envList('CART_STORES').includes(String(storeId)) || !sessionId) return null;
  let h = 0;
  for (const ch of String(sessionId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 ? 'cart' : 'control';
}
function cartOn(arm) { return arm === 'all' || arm === 'cart' || arm === 'test'; }
const CART_NOTE = `🛒 زر السلة مفعّل: تحت ردك يظهر زر "أضف للسلة" لكل منتج كتبت رابطه، وبعده زر "إتمام الطلب".
- لما ترشّح منتج، اكتب رابطه (من نتائج البحث) عشان يظهر زره، وقل مرة وحدة: "تقدر تضيفه للسلة من الزر تحت 👇".
- هذا يلغي قاعدة "ممنوع لغة السلة": لا تقول "ضفته لك" (الزبون هو اللي يضغط)، لكن تقدر تقول "أضفه للسلة".`;

// Reply language follows the customer's latest message that has enough
// letters to tell ("ok" doesn't). The prompt alone let Arabic replies through
// to English messages.
const ENGLISH_NOTE = `🌐 The customer is writing in English. Reply entirely in English. The CHOICES line must be in English too (e.g. CHOICES: [Get 250g] [Get 1kg] [Show me the recipe]) — this overrides the Arabic CHOICES examples. Write product names in English (e.g. أكيا → Akia) but keep each link URL exactly as the search tool returned it. Prices in SAR.`;
function customerWritesEnglish(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user' || typeof m.content !== 'string') continue;
    const latin = (m.content.match(/[A-Za-z]/g) || []).length;
    const arabic = (m.content.match(/[\u0621-\u064A]/g) || []).length;
    if (latin + arabic < 4) continue;
    return latin > arabic * 2;
  }
  return false;
}

function toolsEnabled(storeId) {
  return (process.env.TOOLS_STORES || '').split(',').map(x => x.trim()).filter(Boolean).includes(String(storeId));
}

// Pre-filled WhatsApp link for qualified wholesale leads
function buildWholesaleLink(details) {
  const msg = 'طلب جملة | ' + (details || 'من مساعد Guider');
  return 'https://wa.me/966544141466?text=' + encodeURIComponent(msg);
}

// ---------- Security ----------
// Drip On runs on the Advanced Customization JS before the private app is
// installed there, so its origins stay hardcoded and map to 'dripon'.
const STATIC_ORIGINS = {
  'https://driponcoffeesa.com': 'dripon',
  'https://www.driponcoffeesa.com': 'dripon'
};

// Origins of stores that installed the app, refreshed every 5 minutes.
let storeOriginCache = { at: 0, map: {} };
async function getStoreOrigins() {
  if (Date.now() - storeOriginCache.at < 5 * 60 * 1000) return storeOriginCache.map;
  const map = {};
  const r = await sb('GET', '/stores?select=salla_store_id,store_domain&is_active=eq.true');
  if (r.ok && Array.isArray(r.data)) {
    for (const row of r.data) {
      if (!row.store_domain) continue;
      try {
        const u = new URL(row.store_domain);
        const host = u.hostname.replace(/^www\./, '');
        map[`https://${host}`] = row.salla_store_id;
        map[`https://www.${host}`] = row.salla_store_id;
      } catch {}
    }
    storeOriginCache = { at: Date.now(), map };
  }
  return storeOriginCache.map;
}

// Returns the store id for an allowed origin, or null.
async function resolveStore(origin) {
  if (!origin) return null;
  const installed = await getStoreOrigins();
  return installed[origin] || STATIC_ORIGINS[origin] || null;
}

async function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const storeId = await resolveStore(origin);
  if (storeId) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return storeId;
}

const RATE = new Map();
function rateLimited(sessionId, ip) {
  const now = Date.now();
  for (const [k, v] of RATE) if (now - v.start > 3600000) RATE.delete(k);
  const bump = (key, cap) => {
    const e = RATE.get(key) || { n: 0, start: now };
    e.n += 1; RATE.set(key, e);
    return e.n > cap;
  };
  if (sessionId && bump('s:' + sessionId, 40)) return true;
  if (ip && bump('i:' + ip, 120)) return true;
  return false;
}

// ---------- Detectors (rewritten) ----------
const PRODUCT_NAMES = [
  ...Object.keys(BEAN_LINKS), ...Object.keys(BAG_LINKS), ...Object.keys(OTHER_LINKS)
];

// Was: only checked the LAST assistant message.
function detectRecommendation(messages) {
  const found = new Set();
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.content) continue;
    for (const p of PRODUCT_NAMES) if (m.content.includes(p)) found.add(p);
  }
  if (!found.size) return { recommendation: null, reached: false };
  return { recommendation: [...found].join(' + '), reached: true };
}

// Was: returned a stage name based purely on message count.
function detectDropOffStep(messages) {
  const userMsgs = messages.filter(m => m.role === 'user');
  if (!userMsgs.length) return 'no_interaction';
  const lastUserAt = messages.map(m => m.role).lastIndexOf('user');
  let recAt = -1;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant' && m.content && PRODUCT_NAMES.some(p => m.content.includes(p))) { recAt = i; break; }
  }
  if (recAt !== -1) return lastUserAt > recAt ? 'after_recommendation_engaged' : 'after_recommendation_silent';
  const txt = messages.filter(m => m.role === 'assistant').map(m => m.content || '').join('\n');
  if (/تحب الفاكهي|حمضية منعشة|فاكهي أنيق|ما أحب الحامض/.test(txt)) return 'after_taste_preference';
  if (userMsgs.length > 1) return 'after_brewing_method';
  return 'after_welcome';
}

async function logConversation(storeId, sessionId, messages, recommendation, reachedRecommendation, dropOffStep, usage, latencyMs) {
  try {
    const body = JSON.stringify({
      session_id: sessionId,
      store_id: storeId,
      messages: messages,
      recommendation: recommendation || null,
      reached_recommendation: reachedRecommendation || false,
      drop_off_step: dropOffStep || null,
      usage: usage || null,
      latency_ms: latencyMs == null ? null : latencyMs
    });
    const url = new URL(`${SUPABASE_URL}/rest/v1/conversations`);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 300) console.error('logConversation failed:', res.statusCode, data.slice(0, 200));
          resolve();
        });
      });
      req.on('error', (err) => { console.error('logConversation error:', err.message); resolve(); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error('Logging failed:', err.message);
  }
}

// Two Salla apps post here: the public app (SALLA_WEBHOOK_SECRET) and the
// private app (SALLA_PRIVATE_WEBHOOK_SECRET). Both use the Token strategy.
// Signature (HMAC of the raw body) can't be verified on Vercel's Node runtime:
// the body is parsed before the handler runs and the raw bytes are gone.
function verifySallaWebhook(req) {
  // Trimmed: a value pasted into Vercel with a trailing newline or space
  // would otherwise never match.
  const secrets = [process.env.SALLA_WEBHOOK_SECRET, process.env.SALLA_PRIVATE_WEBHOOK_SECRET]
    .filter(Boolean).map(v => v.trim());
  if (!secrets.length) {
    console.error('No Salla webhook secret configured');
    return false;
  }
  // Salla's docs aren't explicit about where the Token strategy puts the
  // token; the public app's events were accepted with either header before.
  const candidates = [
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim(),
    String(req.headers['x-salla-signature'] || '').trim()
  ].filter(Boolean);
  const ok = candidates.some(token => secrets.some(secret => {
    const given = Buffer.from(token), expected = Buffer.from(secret);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }));
  if (!ok) {
    // Header names and the declared strategy only; never values.
    // Lengths and an 8-hex-char SHA-256 prefix tell a whitespace or
    // wrong-secret mismatch apart without revealing any value.
    const fp = v => `${v.length}:${crypto.createHash('sha256').update(v).digest('hex').slice(0, 8)}`;
    console.warn('Salla webhook rejected', JSON.stringify({
      strategy: req.headers['x-salla-security-strategy'] || null,
      headers: Object.keys(req.headers).filter(h => /salla|authorization/i.test(h)),
      received: candidates.map(fp),
      configured: secrets.map(fp),
      authScheme: (req.headers['authorization'] || '').split(' ')[0] || null
    }));
  }
  return ok;
}

// Keeps what measurement and customer memory need: who (Salla customer id),
// what (products, quantities, amounts), when and where (city). Contact details
// (name, email, phone, birthday) stay in Salla and are read from there only
// when a consented feature needs them.
function extractOrderData(payload) {
  // order.status.updated sends a status-history entry with the order nested
  // under data.order; other order events send the order itself as data.
  const outer = payload.data || payload;
  const data = outer.order && typeof outer.order === 'object' ? outer.order : outer;
  const items = data.items || data.products || [];
  const productNames = items.map(item => item.name || item.product_name || '').filter(Boolean);
  const customer = data.customer || {};
  const amountOf = v => { const n = parseFloat(v && typeof v === 'object' ? v.amount : v); return isNaN(n) ? null : n; };
  return {
    salla_order_id: String(data.id || ''),
    salla_order_reference: data.reference_id || data.order_number || null,
    customer_id: customer.id ? String(customer.id) : null,
    customer_city: customer.city || (data.shipping && data.shipping.address && data.shipping.address.city) || null,
    total_amount: parseFloat(data.total && data.total.amount) || parseFloat(data.amounts && data.amounts.total && data.amounts.total.amount) || 0,
    currency: (data.total && data.total.currency) || (data.amounts && data.amounts.total && data.amounts.total.currency) || 'SAR',
    shipping_cost: parseFloat(data.shipping_cost) || parseFloat(data.amounts && data.amounts.shipping_cost && data.amounts.shipping_cost.amount) || 0,
    order_status: (data.status && data.status.name) || data.status || null,
    status_slug: (data.status && data.status.slug) || null,
    payment_status: data.payment_method || (data.payment && data.payment.status) || null,
    payment_method: data.payment_method || null,
    order_date: (data.date && data.date.date) || null,
    source: data.source || null,
    items_count: items.length,
    product_names: productNames,
    items: items.map(it => ({
      product_id: it.product && it.product.id ? String(it.product.id) : (it.product_id ? String(it.product_id) : null),
      sku_id: it.product_sku_id ? String(it.product_sku_id) : null,
      name: it.name || it.product_name || null,
      quantity: it.quantity || 1,
      total: amountOf(it.amounts && it.amounts.total)
    }))
  };
}

// Links an order to the widget session that preceded it. Salla requires
// login (phone OTP) at checkout, so the widget reports the Salla customer id
// on every page, including the thank-you page. A session counts if that
// customer was seen in it within the 7 days before the order and it had a
// conversation with the bot.
const ATTRIBUTION_WINDOW_DAYS = 7;
// Salla order dates are Riyadh local time ("2026-10-14 16:08:34.000000").
function orderTime(orderData) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(orderData.order_date || '');
  const t = m ? Date.parse(`${m[1]}T${m[2]}+03:00`) : NaN;
  return isNaN(t) ? Date.now() : t;
}

// An order counts for the bot only if the customer chatted in one of their
// sessions during the 7 days BEFORE the order was placed. Status updates of
// old orders arrive days later, so the window is anchored on the order date,
// not on when the webhook arrived.
// Visit context (marketing source) sent by the widget with the first chat
// message of a session. Only whitelisted, length-capped fields are kept;
// country and city come from Vercel's IP geolocation headers (no IP stored).
const TOUCH_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'click_id', 'referrer', 'landing_path', 'direct', 'at'];
function cleanTouch(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  for (const k of TOUCH_FIELDS) {
    const v = t[k];
    if (v == null) continue;
    if (k === 'direct') { out.direct = v === true; continue; }
    if (k === 'at') { if (Number.isFinite(Number(v))) out.at = new Date(Number(v)).toISOString(); continue; }
    out[k] = String(v).slice(0, k === 'landing_path' ? 200 : 100);
  }
  return Object.keys(out).length ? out : null;
}
function saveVisitContext(storeId, sessionId, ctx, headers) {
  if (!ctx || typeof ctx !== 'object' || typeof sessionId !== 'string' || !/^session_[\w]{6,60}$/.test(sessionId)) return Promise.resolve();
  const dec = v => { try { return v ? decodeURIComponent(String(v)).slice(0, 80) : null; } catch { return null; } };
  return sb('POST', '/session_context?on_conflict=store_id,session_id', {
    store_id: storeId, session_id: sessionId,
    first_touch: cleanTouch(ctx.first), last_touch: cleanTouch(ctx.last),
    device: ctx.device === 'mobile' ? 'mobile' : ctx.device === 'desktop' ? 'desktop' : null,
    chat_path: typeof ctx.chat_path === 'string' ? ctx.chat_path.slice(0, 200) : null,
    country: dec(headers['x-vercel-ip-country']), city: dec(headers['x-vercel-ip-city'])
  }, 'resolution=ignore-duplicates,return=minimal').then(r => { if (!r.ok) console.error('session_context insert failed:', r.status); });
}

async function attributeToSession(orderData, storeId) {
  const none = { session_id: null, method: 'none', confidence: 'none' };
  if (!orderData.customer_id) return none;
  // The owner's own test orders would inflate the numbers.
  if (envList('ATTRIBUTION_EXCLUDE_CUSTOMERS').includes(String(orderData.customer_id))) {
    return { session_id: null, method: 'excluded', confidence: 'none' };
  }
  const ids = await sb('GET', `/session_identities?select=session_id` +
    `&store_id=eq.${encodeURIComponent(storeId)}` +
    `&customer_id=eq.${encodeURIComponent(orderData.customer_id)}&limit=50`);
  if (!ids.ok || !Array.isArray(ids.data) || !ids.data.length) return none;
  const sessions = [...new Set(ids.data.map(r => r.session_id))].filter(x => /^session_[\w]+$/.test(x));
  if (!sessions.length) return none;
  const at = orderTime(orderData);
  const from = new Date(at - ATTRIBUTION_WINDOW_DAYS * 86400000).toISOString();
  const to = new Date(at).toISOString();
  const conv = await sb('GET', `/conversations?select=session_id,created_at` +
    `&store_id=eq.${encodeURIComponent(storeId)}&session_id=in.(${sessions.join(',')})` +
    `&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}` +
    `&order=created_at.desc&limit=1`);
  if (conv.ok && Array.isArray(conv.data) && conv.data.length) {
    return { session_id: conv.data[0].session_id, method: 'customer_id', confidence: 'high' };
  }
  return none;
}

async function logSallaOrder(storeId, eventType, payload) {
  try {
    const orderData = extractOrderData(payload);
    const attribution = await attributeToSession(orderData, storeId);
    const r = await sb('POST', '/orders', {
      store_id: storeId,
      event_type: eventType,
      event_timestamp: new Date().toISOString(),
      salla_order_id: orderData.salla_order_id,
      salla_order_reference: orderData.salla_order_reference,
      customer_id: orderData.customer_id,
      customer_city: orderData.customer_city,
      total_amount: orderData.total_amount,
      currency: orderData.currency,
      shipping_cost: orderData.shipping_cost,
      order_status: orderData.order_status,
      payment_status: orderData.payment_status,
      payment_method: orderData.payment_method,
      items_count: orderData.items_count,
      product_names: orderData.product_names,
      session_id: attribution.session_id,
      attribution_method: attribution.method,
      attribution_confidence: attribution.confidence,
      // Minimal record instead of Salla's full payload, which carries the
      // customer's contact details and birthday.
      raw_payload: {
        event: eventType,
        merchant: payload && payload.merchant,
        status_slug: orderData.status_slug,
        order_date: orderData.order_date,
        source: orderData.source,
        items: orderData.items
      }
    });
    if (!r.ok) console.error('Supabase orders insert failed:', r.status, JSON.stringify(r.data).slice(0, 200));
  } catch (err) {
    console.error('logSallaOrder failed:', err.message);
  }
}

// Memory backfill: orders placed before the app was installed never came
// through a webhook. The first time a logged-in customer with no stored
// orders chats, their orders are read from Salla once (one API call) and
// stored like webhook orders, minus attribution. A `memory.backfill` row in
// salla_events marks the customer as done (also when nothing was found), so
// the API budget (10K calls/month per store) is spent once per customer.
const BACKFILL_EVENT = 'memory.backfill';
const backfilled = new Set(); // per warm instance, saves the marker lookup
async function backfillCustomerOrders(storeId, customerId) {
  const s = encodeURIComponent(storeId), c = String(customerId);
  if (!/^\d{1,20}$/.test(c) || backfilled.has(storeId + ':' + c)) return false;
  const done = await sb('GET', `/salla_events?select=id&store_id=eq.${s}&event_type=eq.${BACKFILL_EVENT}` +
    `&raw_payload->>customer_id=eq.${c}&limit=1`);
  if (!done.ok || !Array.isArray(done.data)) return false;
  if (done.data.length) { backfilled.add(storeId + ':' + c); return false; }
  const token = await storeToken(storeId);
  if (!token) return false;
  const res = await httpsGet('api.salla.dev', `/admin/v2/orders?customer_id=${c}&per_page=50`, {
    'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Accept-Language': 'ar'
  }).catch(err => ({ error: err.message }));
  const list = res && Array.isArray(res.data) ? res.data : null;
  // Only orders that name this customer are kept, in case the filter is
  // ignored. Field names (not values) are recorded to check the list shape.
  const mine = list ? list.filter(o => o && o.customer && String(o.customer.id) === c) : [];
  const existing = await sb('GET', `/orders?select=salla_order_id&store_id=eq.${s}&customer_id=eq.${c}`);
  const seen = new Set(existing.ok && Array.isArray(existing.data) ? existing.data.map(r => String(r.salla_order_id)) : []);
  const rows = [];
  for (const o of mine) {
    const d = extractOrderData({ data: o });
    if (!d.salla_order_id || seen.has(d.salla_order_id)) continue;
    rows.push({
      store_id: storeId, event_type: 'backfill', event_timestamp: new Date().toISOString(),
      salla_order_id: d.salla_order_id, salla_order_reference: d.salla_order_reference,
      customer_id: c, customer_city: d.customer_city, total_amount: d.total_amount, currency: d.currency,
      shipping_cost: d.shipping_cost, order_status: d.order_status, payment_status: d.payment_status,
      payment_method: d.payment_method, items_count: d.items_count, product_names: d.product_names,
      session_id: null, attribution_method: 'backfill', attribution_confidence: 'none',
      raw_payload: { event: 'backfill', status_slug: d.status_slug, order_date: d.order_date, source: d.source, items: d.items }
    });
  }
  // One insert for all rows: the database is far from the function region.
  let stored = 0;
  if (rows.length) {
    const r = await sb('POST', '/orders', rows, 'return=minimal');
    if (r.ok) stored = rows.length; else console.error('backfill insert failed:', r.status);
  }
  await sb('POST', '/salla_events', {
    store_id: storeId, event_type: BACKFILL_EVENT,
    raw_payload: {
      customer_id: c, ok: !!list, listed: list ? list.length : null, matched: mine.length, stored,
      error: list ? null : String((res && (res.error && (res.error.message || res.error))) || (res && res.status) || 'no data').slice(0, 120),
      order_keys: list && list[0] ? Object.keys(list[0]) : null,
      item_keys: list && list[0] && Array.isArray(list[0].items) && list[0].items[0] ? Object.keys(list[0].items[0]) : null
    }
  }, 'return=minimal');
  backfilled.add(storeId + ':' + c);
  console.log('BACKFILL', JSON.stringify({ storeId, listed: list ? list.length : null, matched: mine.length, stored }));
  return stored > 0;
}

// Non-order events keep only the event name and the entity id. Product and
// customer payloads carry personal data we don't need to store; catalog sync
// (Block 1) refetches from the Salla API instead.
async function logSallaEvent(storeId, eventType, payload) {
  const data = (payload && payload.data) || {};
  const r = await sb('POST', '/salla_events', {
    store_id: storeId,
    event_type: eventType,
    raw_payload: { event: eventType, merchant: payload && payload.merchant, entity_id: data.id || null },
    processed: false
  });
  if (!r.ok) console.error('salla_events insert failed:', r.status);
}

// Easy Mode OAuth (private app): Salla posts the tokens in app.store.authorize.
// They go to `stores` only and are never logged.
async function handleStoreAuthorize(payload) {
  const storeId = String(payload.merchant || '');
  const data = payload.data || {};
  if (!storeId || !data.access_token) {
    console.error('app.store.authorize missing merchant or token');
    return;
  }
  let storeName = null, storeDomain = null, plan = null;
  try {
    const info = await httpsGet('api.salla.dev', '/admin/v2/store/info', {
      'Authorization': `Bearer ${data.access_token}`,
      'Accept': 'application/json'
    });
    if (info && info.data) {
      storeName = info.data.name || null;
      storeDomain = info.data.domain || null;
      plan = info.data.plan || null;
    }
  } catch (err) {
    console.error('Store info fetch failed:', err.message);
  }
  const expiresAt = data.expires ? new Date(Number(data.expires) * 1000).toISOString() : null;
  const r = await sb('POST', '/stores?on_conflict=salla_store_id', {
    salla_store_id: storeId,
    store_name: storeName,
    store_domain: storeDomain,
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_at: expiresAt,
    scope: data.scope || null,
    is_active: true,
    plan,
    salla_app: 'private',
    installed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, 'resolution=merge-duplicates,return=minimal');
  if (!r.ok) console.error('Store save failed:', r.status);
  else console.log('Store authorized:', storeId, storeName);
  storeOriginCache.at = 0;
  if (r.ok) await syncStoreProducts(storeId);
}

// Salla access tokens live 14 days and Salla's review asks apps to refresh
// them by day 10. Vercel cron calls this daily; any token expiring within 5
// days (so at most 10 days old, given the daily run) is refreshed with the
// client credentials of the app
// the store installed. Refresh tokens are single-use, so a store refreshed in
// the last 12 hours is skipped: an extra call to this public URL can't race a
// refresh in progress or burn a token.
const REFRESH_WINDOW_MS = 5 * 86400000;
const REFRESH_COOLDOWN_MS = 12 * 3600000;
async function refreshExpiringTokens() {
  const horizon = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString();
  const r = await sb('GET', `/stores?select=salla_store_id,salla_app,refresh_token,updated_at` +
    `&is_active=eq.true&refresh_token=not.is.null&expires_at=lt.${encodeURIComponent(horizon)}`);
  if (!r.ok || !Array.isArray(r.data)) return { checked: 0, refreshed: 0, skipped: 0, failed: 1 };
  let refreshed = 0, failed = 0, skipped = 0;
  for (const store of r.data) {
    if (store.updated_at && Date.now() - new Date(store.updated_at).getTime() < REFRESH_COOLDOWN_MS) { skipped++; continue; }
    const isPrivate = store.salla_app === 'private';
    const form = querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: store.refresh_token,
      client_id: isPrivate ? process.env.SALLA_PRIVATE_CLIENT_ID : process.env.SALLA_CLIENT_ID,
      client_secret: isPrivate ? process.env.SALLA_PRIVATE_CLIENT_SECRET : process.env.SALLA_CLIENT_SECRET
    });
    let token = null;
    try {
      token = await httpsPost('accounts.salla.sa', '/oauth2/token', {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form)
      }, form);
    } catch (err) {
      console.error('Token refresh network error:', store.salla_store_id, err.message);
    }
    if (!token || !token.access_token) {
      failed++;
      console.error('Token refresh failed:', store.salla_store_id, (token && (token.error || token.message)) || 'no response');
      continue;
    }
    const u = await sb('PATCH', `/stores?salla_store_id=eq.${encodeURIComponent(store.salla_store_id)}`, {
      access_token: token.access_token,
      refresh_token: token.refresh_token || store.refresh_token,
      expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      updated_at: new Date().toISOString()
    });
    if (u.ok) { refreshed++; console.log('Token refreshed:', store.salla_store_id); }
    else { failed++; console.error('Token save failed after refresh:', store.salla_store_id, u.status); }
  }
  return { checked: r.data.length, refreshed, skipped, failed };
}

// ---------- Catalog sync (Block 1) ----------
// Products are cached per store so the bot reads live prices and stock
// instead of the hardcoded prompt. Full sync on install and daily; product
// webhooks keep rows fresh in between. `metadata` (our enrichment) is never
// written by sync, so a resync can't wipe it.
function amount(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') return amount(v.amount);
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function mapProduct(storeId, p) {
  const price = p.price || {};
  const unlimited = p.unlimited_quantity === true;
  return {
    store_id: storeId,
    salla_product_id: String(p.id),
    name: p.name || null,
    sku: p.sku || null,
    type: p.type || null,
    status: p.status || null,
    is_available: typeof p.is_available === 'boolean' ? p.is_available : (p.status ? p.status === 'sale' : null),
    quantity: unlimited ? null : (Number.isInteger(p.quantity) ? p.quantity : null),
    // taxed_price is what the shopper pays (VAT-inclusive); price can be pre-tax.
    price: amount(p.taxed_price) ?? amount(p.price),
    regular_price: amount(p.regular_price),
    sale_price: amount(p.sale_price),
    currency: price.currency || (p.regular_price && p.regular_price.currency) || null,
    url: p.url || (p.urls && (p.urls.customer || p.urls.store)) || null,
    image: (p.main_image && (p.main_image.url || p.main_image)) || p.thumbnail || null,
    brand: (p.brand && p.brand.name) || null,
    categories: Array.isArray(p.categories) ? p.categories.map(c => ({ id: c.id, name: c.name })) : [],
    options: Array.isArray(p.options) ? p.options.map(o => ({
      name: o.name, values: Array.isArray(o.values) ? o.values.map(v => ({ id: v.id, name: v.name, price: amount(v.price) })) : []
    })) : [],
    description: typeof p.description === 'string' ? p.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000) : null,
    raw: p,
    synced_at: new Date().toISOString(),
    removed_at: null
  };
}

async function upsertProducts(rows) {
  if (!rows.length) return true;
  const r = await sb('POST', '/products?on_conflict=store_id,salla_product_id', rows, 'resolution=merge-duplicates,return=minimal');
  if (!r.ok) console.error('products upsert failed:', r.status, JSON.stringify(r.data).slice(0, 200));
  return r.ok;
}

async function storeToken(storeId) {
  const r = await sb('GET', `/stores?select=access_token&is_active=eq.true&salla_store_id=eq.${encodeURIComponent(storeId)}`);
  return r.ok && Array.isArray(r.data) && r.data[0] ? r.data[0].access_token : null;
}

// Pages through /products (max 60 per page). Products not seen in a complete
// run are marked removed, never deleted.
async function syncStoreProducts(storeId) {
  const token = await storeToken(storeId);
  if (!token) return { storeId, ok: false, reason: 'no token' };
  const started = new Date().toISOString();
  let page = 1, totalPages = 1, count = 0;
  while (page <= totalPages && page <= 300) {
    const res = await httpsGet('api.salla.dev', `/admin/v2/products?page=${page}&per_page=60`, {
      'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Accept-Language': 'ar'
    }).catch(err => ({ error: err.message }));
    if (!res || !Array.isArray(res.data)) {
      console.error('Product sync page failed:', storeId, page, (res && (res.error && (res.error.message || res.error))) || res && res.status);
      return { storeId, ok: false, count, reason: 'page ' + page };
    }
    if (!await upsertProducts(res.data.map(p => mapProduct(storeId, p)))) return { storeId, ok: false, count, reason: 'upsert' };
    count += res.data.length;
    totalPages = (res.pagination && res.pagination.totalPages) || 1;
    page++;
  }
  await sb('PATCH', `/products?store_id=eq.${encodeURIComponent(storeId)}&synced_at=lt.${encodeURIComponent(started)}&removed_at=is.null`,
    { removed_at: new Date().toISOString() });
  console.log('Product sync done:', storeId, count);
  return { storeId, ok: true, count };
}

async function syncAllStores() {
  const r = await sb('GET', '/stores?select=salla_store_id&is_active=eq.true&access_token=not.is.null');
  if (!r.ok || !Array.isArray(r.data)) return [];
  const out = [];
  for (const s of r.data) out.push(await syncStoreProducts(s.salla_store_id));
  return out;
}

// product.* webhooks carry the product in `data`.
async function handleProductEvent(storeId, eventType, payload) {
  const p = payload && payload.data;
  if (!p || !p.id) return;
  if (eventType === 'product.deleted') {
    await sb('PATCH', `/products?store_id=eq.${encodeURIComponent(storeId)}&salla_product_id=eq.${encodeURIComponent(String(p.id))}`,
      { removed_at: new Date().toISOString() });
    return;
  }
  await upsertProducts([mapProduct(storeId, p)]);
}

async function handleAppUninstalled(payload) {
  const storeId = String(payload.merchant || '');
  if (!storeId) return;
  const r = await sb('PATCH', `/stores?salla_store_id=eq.${encodeURIComponent(storeId)}`, {
    is_active: false, access_token: null, refresh_token: null, updated_at: new Date().toISOString()
  });
  if (!r.ok) console.error('Store deactivate failed:', r.status);
  storeOriginCache.at = 0;
}

function httpsGet(hostname, pathStr, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: pathStr, method: 'GET', headers }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function saveStoreToken(storeData) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(storeData);
    const url = new URL(`${SUPABASE_URL}/rest/v1/stores`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + '?on_conflict=salla_store_id',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          console.error('Store save failed:', res.statusCode, data);
          reject(new Error(`Supabase error ${res.statusCode}: ${data}`));
        } else resolve();
      });
    });
    req.on('error', (err) => { console.error('Store save network error:', err.message); reject(err); });
    req.write(body);
    req.end();
  });
}

function httpsPost(hostname, pathStr, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({ hostname, path: pathStr, method: 'POST', headers }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const SYSTEM_PROMPT = `أنت "أحمد" — مستشار قهوة من فريق دريب اون. باريستا حقيقي يفهم القهوة بعمق، وأذكى مساعد بيع. مهمتك الأولى مصلحة الزبون. البيع يجي طبيعياً لما الزبون يحس إنك في صفّه.

═══════════════════════════════════
شخصيتك
═══════════════════════════════════
- سعودي من جدة، لهجتك عفوية ١٠٠٪
- خبير قهوة حقيقي — تفهم الكيمياء والفروق، مو بس تردد أسماء
- صادق — تنصح بالأنسب، وتوضّح ليش
- دافي بدون مبالغة، واثق بدون تعالي
- تكلم بنفس لغة الزبون (عربي/إنجليزي) بدون تعليق

═══════════════════════════════════
🔗 الروابط
═══════════════════════════════════
**لا تكتب روابط منتجات بنفسك أبداً.** اذكر اسم المنتج كنص عادي فقط —
النظام يحوّله لرابط تلقائياً بعد ردك.

الروابط الوحيدة المسموح لك كتابتها:
- ✅ [💬 تواصل على واتساب](https://wa.me/966549111266) — خدمة العملاء
- ✅ [💬 تواصل مع فريق الجملة](https://wa.me/966544141466) — لطلبات الجملة المؤهلة فقط
- ✅ [📧 info@driponcoffeesa.com](mailto:info@driponcoffeesa.com)

═══════════════════════════════════
🤖 "انت مين؟" — الرد على السؤال المباشر فقط
═══════════════════════════════════
**لا تعرّف نفسك ابتداءً أبداً.** الترحيب تم في الواجهة.

**لكن** إذا سأل الزبون مباشرة ("انت مين؟" / "انت بوت؟" / "انت إنسان؟" / "من جدك؟"):

"أنا أحمد، مساعد ذكي من فريق دريب اون 🙂
مدرّب على محاصيلنا وطرق تحضيرها.
ولو تبغى تكلم أحد من الفريق، أوصّلك على طول."

CHOICES: [كمّل، رشّح لي] [أبغى أكلم الفريق]

❌ ممنوع تدّعي إنك إنسان
❌ ممنوع تتهرب من السؤال

═══════════════════════════════════
✂️ قاعدة الإيجاز — صارمة
═══════════════════════════════════
**الحد الأقصى ٦ أسطر بصرية في أي رد.** الزبائن على الجوال يفحصون، لا يقرؤون.
توصية مباشرة، سبب، سعر، ثم اسكت.

═══════════════════════════════════
🗣️ CHOICES = صوت الزبون
═══════════════════════════════════
ابدأ الـCHOICE بفعل من الزبون (أخذ، أبغى، يعجبني) أو اسم منتج فقط.
ممنوع "أبشر" / "ابشر" / "تمام يا" — هذي ردود بوت.

═══════════════════════════════════
📐 الصياغة
═══════════════════════════════════
- استخدم "جرام" مو "g"
- كل سعر على سطر منفصل بنقطة (•)
- استخدم em-dash (—) للفصل
- السعر **بعد** الوصف، مو قبله
- كلمة "حوالي" بدل ~

═══════════════════════════════════
🛑 ممنوع لغة السلة
═══════════════════════════════════
أنت **مرشد**، مو موظف يضيف للسلة.
❌ "ضفت لك" → ✅ "أرشّحلك"
❌ "للسلة" → ✅ "تقدر تطلبه من المتجر"

═══════════════════════════════════
🗣️ قواعد اللهجة — صارمة
═══════════════════════════════════
ممنوع كلمات مصرية/شامية:
دلوقتي → الحين | عايز → تبغى | كده → كذا | مش → مو | فين → وين | ليه → ليش
ممنوع "كابتشينو" — استخدم **فلات وايت / لاتيه / كورتادو**.

═══════════════════════════════════
⚙️ الطحن — الخدمة موقوفة حالياً
═══════════════════════════════════
**نبيع الحبوب كاملة فقط. خدمة الطحن موقوفة.**

🚫 **ممنوع** تعرض الطحن أو تقترحه أو تقول إن فيه خيار طحن في صفحة المنتج.
🚫 **ممنوع** تسأل "عندك مطحنة؟".

بعد أول توصية بن، أضف سطر واحد فقط ولا تكرره:
"تجيك حبوب كاملة."

**لو الزبون سأل عن الطحن صراحة، أو قال ما عنده مطحنة:**
"حالياً نوفر الحبوب كاملة بس، وخدمة الطحن موقوفة مؤقتاً.
لو ما عندك مطحنة، الأظرف أنسب لك — نفس المحاصيل، تحطه على الكوب وتصب ماء حار وبس."

═══════════════════════════════════
💰 الأسعار والخصومات
═══════════════════════════════════
**ما فيه خصم على الكيلو.** اذكر سعر الكيلو كما هو، بدون "بدل" وبدون نسبة خصم.

🚫 **ممنوع ذكر تاريخ انتهاء أي خصم.**
🚫 ممنوع اختراع أسعار أو خصومات.

═══════════════════════════════════
☕ الكتالوج — المحاصيل المتوفرة
═══════════════════════════════════
(كل الأسعار شاملة ضريبة ١٥٪)

▼ **للحليب والإسبريسو — كلاسيكيات شوكولاتية:**
- أكيا (برازيل) | ١٢٥: ٣٨.٥٨ | ٢٥٠: ٤٢.٥٥ | كيلو: ١٣٧.٧١ | شوكولاتة، بندق، فول سوداني
- هاسيندا (كولومبيا، عسلي) | ١٢٥: ٣٣.٥٥ | ٢٥٠: ٤٥.٣٢ | كيلو: ١٤٧.٩٥ | عسل، كشمش أحمر، حموضة هادية | ⭐ الأشهر
- بليند | ١٢٥: ٣٦.٢٤ | ٢٥٠: ٤٩.٤٥ | كيلو: ١٧٢.٢٧ | جوز، حموضة حلوة، عنب أخضر، قرفة | للإسبريسو ومشروبات الحليب فقط
- شوكو لاهوائي (برازيل) | ١٢٥: ٣٨.٤٣ | ٢٥٠: ٥٩.٨٠ | كيلو: ٢٠٤.٦٢ | شوكولاتة داكنة، كراميل | ⭐ الأفضل للحليب

▼ **إسبريسو بلاك:**
- حراز (يمن) | ١٢٥: ٤٦.١٠ | ٢٥٠: ٧٣.٦٠ | كيلو: ٢٤٤.٩٥ | شوكولاتة، كراميل، زبيب، بهارات

▼ **V60 إثيوبي فاكهي أنيق:**
- هامبيلا (إثيوبيا، مجفف) | ١٢٥: ٣٦.٠١ | ٢٥٠: ٥٦.٤٤ | كيلو: ١٨٤.٥٨ | مانجو، خوخ، ياسمين | حموضة منخفضة | ⭐ الأشهر
- شيلشيلي (إثيوبيا) | ١٢٥: ٣٦.٢٣ | ٢٥٠: ٥٢.٩٠ | كيلو: ١٨٥.٩٨ | شاي الزهور، برقوق، توت بري، خوخ
- كايا (إثيوبيا، مجفف) — جديد | ١٢٥: ٣٨.٢٤ | ٢٥٠: ٦٢.٨٨ | كيلو: ٢٢١.٥٦ | توت مشكّل، مانجو، شوكولاتة داكنة | حموضة مرتفعة | فلتر فقط

▼ **V60 كلاسيكي متوازن:**
- روينزوري (أوغندا) | ١٢٥: ٣٢.٨٦ | ٢٥٠: ٤٣.٧٠ | كيلو: ١٤٢.٦٠ | أناناس، برقوق، استوائي
- فيلا سيبرس (السلفادور) | ١٢٥: ٣٤.٩٣ | ٢٥٠: ٤٥.٢٨ | كيلو: ١٦٦.٦٧ | متزن وناعم
- ماناناسي (أوغندا) | ١٢٥: ٣٧.٤١ | ٢٥٠: ٥٥.٤٠ | كيلو: ١٧٦.٤٨ | شاي أسود، مشمش، مانجو، باشن فروت
- كالداس (كولومبيا، مجفف) | ١٢٥: ٤٠.٥٧ | ٢٥٠: ٦٤.٧٦ | كيلو: ٢١٥.٠٥ | شوكولاتة حليب، خوخ، يوسفي | فاكهي خفيف
- كاستيلو (كولومبيا، مجفف) — جديد | ١٢٥: ٣٧.٠٤ | ٢٥٠: ٥٨.٥٧ | كيلو: ٢١٣.٥٤ | عنب أحمر، برقوق، فانيلا، دبس | حموضة متوسطة | فلتر فقط
- إل ريناسير (كوستاريكا، عسلي) — جديد | ١٢٥: ٤٣.٥٩ | ٢٥٠: ٧٢.٨٠ | كيلو: ٢٤٧.٧٧ | كراميل، زبيب، عسل، فواكه استوائية | حموضة متوسطة | فلتر فقط

▼ **V60 فاكهي جريء (لاهوائي):**
إثيوبي:
- سفاري لاهوائي — جديد | ١٢٥: ٤٩.٤٧ | ٢٥٠: ٨٣.٠٦ | كيلو: ٢٩٣.٧٩ | زهري، شوكولاتة، مشمش، أناناس، مانجو | حموضة متوسطة | فلتر فقط
- أوراقا لاهوائي — جديد | ٢٥٠ فقط: ٥٩.٨٠ | توت أزرق، ياسمين، أناناس، خوخ، فراولة | حموضة متوسطة | فلتر فقط
كولومبي (١٢٥: ٦٠.٠٥ | ٢٥٠: ٨٩.٧٠ | كيلو: ٣٤٤.٥١ ما لم يُذكر غير كذا):
- عنب لاهوائي | توت أسود، برقوق، تفاح أحمر
- هوليستن لاهوائي | عنب، كيوي، شوكولاتة
- خوخ لاهوائي | خوخ، فراولة، بطيخ
- حبحب لاهوائي | حبحب، فانيلا، ليمون
- ريد فروت لاهوائي | فواكه حمراء، فانيلا، حمضيات
- جوز الهند لاهوائي | فانيلا، جوز هند، كراميل، شوكولاتة بيضاء
- كوتون كاندي لاهوائي | ١٢٥ و٢٥٠ فقط (الكيلو نافد) | حمضيات، برتقال، كراميل، حلاوة الكاندي
- توت لاهوائي — جديد | توت أسود، عنب أحمر | حموضة مرتفعة | فلتر فقط
- فراولة لاهوائي — جديد | فراولة، توت، شوكولاتة، فانيلا | حموضة مرتفعة | فلتر فقط
- باشن فروت لاهوائي | ١٢٥: ٦٠.٢٤ | ٢٥٠: ٩٦.٦٠ | كيلو: ٣٨١.٧٠ | باشن فروت، توت، شمام، استوائي
يمني:
- حراز لاهوائي (نادر) | ١٢٥: ٦٥.٦٢ | ٢٥٠: ٩٥.٤٥ | كيلو: ٣٨٠.٩٣ | برتقال، بطيخ، توت | كميات محدودة

🚫 كل المحاصيل اللي مكتوب عليها "فلتر فقط" ما تناسب الحليب.

▼ **خالي الكافيين:**
- ديكاف كولومبيا | ١٢٥: ٣٩.٠٧ | ٢٥٠: ٥٨.٧١ | كيلو: ٢٠١.٥٠ | سكر بني، توابل

▼ **القهوة السعودية والتركية (منتجان جاهزان):**
- الخلطة الملكية — قهوتنا السعودية | ٢٥٠: ٣٣.٠١
- خلطة السلطان — قهوتنا التركية (مطحونة جاهزة) | ٢٥٠: ٢٦.٠٠

═══════════════════════════════════
🎁 الباكجات المتوفرة
═══════════════════════════════════
🚫 لا تذكر محتوى أو هدايا غير المكتوبة هنا. لو سأل عن تفاصيل أكثر: "التفاصيل كاملة في صفحة الباكج."

**١. بكج التذوق A** — ١٠٠.٣٤ ريال
- ٤ محاصيل × ١٢٥ جرام = ٥٠٠ جرام
- كالداس + هاسيندا + شيلشيلي + هامبيلا
- الاتجاه: أعمق وأكثر فاكهية

**٢. بكج التذوق B** — ٩٦.٨٩ ريال
- ٤ محاصيل × ١٢٥ جرام = ٥٠٠ جرام
- أكيا + روينزوري + شيلشيلي + هاسيندا
- الاتجاه: أخف وأكثر كلاسيكية

**٣. بكج اسبريسو و V60** — ١٥٣.٧١ ريال
- محاصيل من السلفادور والبرازيل واليمن وأوغندا، للإسبريسو والفلتر

**٤. بكج الموهيتو** — ١٩٢.٣١ ريال
- ٤ محاصيل كولومبية لاهوائية × ١٢٥ جرام = ٥٠٠ جرام
- ريد فروت + عنب + باشن فروت + فراولة
- معه كوب جدة الإصدار المحدود

**٥. بكج الفواكه الصيفية** — ١٩٢.١٧ ريال
- ٤ محاصيل × ١٢٥ جرام = ٥٠٠ جرام
- خوخ + جوز الهند + عنب + حبحب
- معه كوب جدة الإصدار المحدود

**٦. بكج المحاصيل الفاخرة** — ١٦٩.١٣ ريال
- ٧٥٠ جرام، محاصيل انفيوجن ولاهوائية: فراولة، توت، عنب، كيوي، برتقال

**٧. بكج الإثيوبيات الكلاسيكي** — ١٢٨.٠٥ ريال
- ٣ محاصيل إثيوبية، ٧٥٠ جرام، فواكه وتوت وخوخ وياسمين وزهور

**٨. بكج V60** — ١٣٩.٠٩ ريال
- تشكيلة محاصيل فلتر فاكهية وزهرية وحلوة

═══════════════════════════════════
✉️ الأظرف — قهوة مقطّرة جاهزة (٥ أكواب للعلبة)
═══════════════════════════════════
كيس صغير بفلتر مدمج. تحطه على الكوب، تصب ماء حار، يطلع كوب V60 احترافي بـ٣ دقايق بدون معدات.

**المتوفر فقط:**
▼ **٣٤.٠١ ريال:** ظرف هامبيلا · ظرف شيلشيلي · ظرف أكيا · ظرف روينزوري · ظرف فيلا سيبرس · ظرف ريفنسيلا
▼ **٣٦ ريال:** ظرف ماناناسي · ظرف ديكاف
▼ **٣٨ ريال:** ظرف كالداس · ظرف شوكو
▼ **٤٠ ريال:** ظرف حراز · ظرف تروبيكال (مانجو، أناناس، بابايا)
▼ **٤١ ريال:** ظرف كوكونت ليمونيد (جوز هند، ليمون)

🚫 أي ظرف غير هذي القائمة **غير متوفر** — لا ترشّحه (مثل ظرف عنب، حبحب، خوخ، فيمتو، هوليستن، باشن فروت، جوز هند، ريد فروت، هاسيندا، حراز لاهوائي، كوتون كاندي).

**❌ لا تذكر سعر الأظرف في الاقتراحات.** بِع الراحة، مو السعر.

**الإشارات اللي تشغّل اقتراح الأظرف:**
سفر · مكتب · ما عندي معدات · ما عندي مطحنة · ما عندي وقت · مبتدئ · هدية بسيطة · أبغى أجرّب

**Cross-sell بعد ترشيح كيلو حبوب (مرة واحدة، بدون سعر، وفقط لو المحصول له ظرف متوفر):**
"ولو تشل قهوتك للمكتب أو السفر، نفس المحصول موجود كأظرف — تفتح وتصب ماء حار وبس."

═══════════════════════════════════
🛠️ الأدوات
═══════════════════════════════════
- كوب جدة الإصدار المحدود — ٥٧.٠٤ ريال (١٢ أونص)
- أكواب ورقية دريب اون ١٠ حبات — ١١.٠١ ريال
- أكواب اليوم الوطني الورقية ٢٠ حبة — ١٧.٢٥ ريال

═══════════════════════════════════
📦 المنتجات النافدة — لا ترشّحها أبداً
═══════════════════════════════════
**غير متوفر:** يرقاتشيف · قوجي كورما · خوخ إندونيسي · حبوب تروبيكال · يلوفروت · فيمتو · ريماسيلا · حبوب كوكونت ليمونيد · بكج الإثيوبيات الفاكهي · شنطة تحضير V60 · كيلو كوتون كاندي

🚫 ممنوع ترشيحها في أي مسار.

✅ لو سأل عنها بالاسم، وضّح إنها غير متوفرة حالياً واعرض البديل:

| غير المتوفر | البديل |
|---|---|
| يرقاتشيف | هامبيلا أو شيلشيلي |
| قوجي كورما | شوكو لاهوائي (حليب) / هامبيلا (V60) |
| خوخ إندونيسي | خوخ لاهوائي (كولومبي — نفس اتجاه النكهة، أصل مختلف) |
| يلوفروت | سفاري لاهوائي أو جوز الهند لاهوائي |
| فيمتو | عنب لاهوائي أو توت لاهوائي |
| ريماسيلا | إل ريناسير (كوستاريكي جديد، عسلي) |
| بكج الإثيوبيات الفاكهي | بكج الإثيوبيات الكلاسيكي |
| شنطة تحضير V60 | قل إنها غير متوفرة حالياً، بدون بديل |
| كيلو كوتون كاندي | كوتون كاندي ٢٥٠ جرام |

🌟 **قاعدة الإنقاذ: حبوب غير متوفرة لها ظرف متوفر**

| الحبوب | الظرف المتوفر | السعر |
|---|---|---|
| تروبيكال | ظرف تروبيكال | ٤٠ |
| كوكونت ليمونيد | ظرف كوكونت ليمونيد | ٤١ |

**مثال:**
"حبوب **تروبيكال** غير متوفرة حالياً — بس **ظرف تروبيكال** متوفر، نفس المحصول.
كيس فيه فلتر مدمج — تحطه على الكوب وتصب ماء حار، ويطلع مانجو وأناناس خلال ٣ دقايق.
السعر: ٤٠ ريال للعلبة (٥ أكواب)"

CHOICES: [أخذ ظرف تروبيكال] [أبغى بديل من الحبوب]

← بديل من الحبوب لتروبيكال: سفاري لاهوائي (مانجو، أناناس) · لكوكونت ليمونيد: جوز الهند لاهوائي

**قواعد الإقناع:**
✅ بِع التوفر الفوري ("تذوقه الحين بدل ما تنتظر")
✅ بِع صفر معدات ("تصب ماء حار وبس")
🚫 ممنوع تقارن السعر — الظرف أغلى للكوب من الحبوب
🚫 ممنوع تقول "أوفر" أو "أرخص"
🚫 ممنوع تكرر العرض لو رفضه

═══════════════════════════════════
🎟️ أكواد الخصم — ما فيه كود فعّال حالياً
═══════════════════════════════════
**ما فيه أي كود خصم فعّال.** كل الأكواد السابقة (D10، EID25، EID20) منتهية.
🚫 ممنوع تخترع كود أو تلمّح إن فيه كود جاي.

لو الزبون سأل: "في خصم؟" / "كود خصم؟" / "في عرض؟" / "ممكن أقل؟"
"حالياً ما فيه كود خصم فعّال، بس خلني أساعدك تختار الأنسب لك بأفضل قيمة 🙂"
وبعدها وجّهه للقيمة: الكيلو أوفر من ٤ أكياس ٢٥٠، وبكج التذوق يعطيك ٤ محاصيل.

لو ذكر كود قديم (D10 أو غيره): "هذا الكود انتهى، وحالياً ما فيه كود فعّال."

لو أصرّ على خصم بعد ما رديت: حوّله لخدمة العملاء بلطف:
"أفهمك. تقدر تتواصل مع فريق خدمة العملاء مباشرة:
[💬 تواصل على واتساب](https://wa.me/966549111266)"

═══════════════════════════════════
📖 وحدة الوصفات
═══════════════════════════════════
بعد أي توصية بن، اعرض مرة واحدة: CHOICES: [تبغى الوصفة؟]

(عمود "الطحن" تحت يخص مطحنة الزبون نفسه في البيت — مو خدمة منّا.)

| الطريقة | النسبة | الحرارة | الطحن | الزمن |
|---|---|---|---|---|
| V60 | ١٥ غ : ٢٥٠ مل | ٩٢–٩٤° | متوسط ناعم | ٢:٣٠–٣:٠٠ |
| V60 مثلج | ١٥ غ : ١٥٠ مل على ١٠٠ غ ثلج | ٩٣° | متوسط ناعم | ٢:٠٠ |
| إسبريسو | ١٨ غ داخل : ٣٦–٤٠ غ خارج | — | ناعم | ٢٥–٣٠ ثانية |
| فرنش برس | ٣٠ غ : ٥٠٠ مل | ٩٤° | خشن | ٤ دقائق |
| كولد برو | ٦٠ غ : ١ لتر | بارد | خشن | ١٢–١٦ ساعة |

**جدول التشخيص — هذا اللي يخليك خبير:**

| الزبون يقول | التشخيص | الحل |
|---|---|---|
| "طلعت حامضة حادة" | استخلاص ناقص | اطحن أنعم، ارفع الحرارة درجتين |
| "طلعت قابضة / مرة" | استخلاص زائد | اطحن أخشن، اخفض الحرارة |
| "طعمها باهت / مايّة" | نسبة ضعيفة | زد البن أو قلل الماء |
| "تنزل بسرعة" | الطحن خشن | اطحن أنعم |
| "تنزل ببطء / تطفح" | الطحن ناعم | اطحن أخشن |

**xbloom:** يشتغل ببروفايلات جاهزة. انصحه ببروفايل V60 وطحن متوسط ناعم، ورشّح الفاكهيات الأنيقة (هامبيلا، شيلشيلي) — الجهاز دقيق ويظهر الطبقات.
**فرنش برس:** رشّح الكلاسيكيات (أكيا، بليند، كالداس) — الطحن الخشن ما يناسب الفاكهيات الدقيقة.

═══════════════════════════════════
☕ القهوة السعودية والتركية
═══════════════════════════════════
🚫 **ممنوع مصطلح "قهوة عربية"** — نقول "قهوة سعودية" فقط.
🚫 **التركي منتج جاهز مطحون (خلطة السلطان)، مو خدمة طحن.** ما فيه طحن تركي للمحاصيل.

**تُذكر في حالتين فقط:**
١. **طلب صريح:** "قهوة سعودية" / "تركي" / "للضيوف" / "للمجلس"
٢. **مسار الهدية**.

🚫 **خارج هاتين: صمت تام.** الزبون اللي داخل يشتري قهوة مختصة ما يبغى خلطة سعودية — اقتراحها عليه يقرأ كسوء فهم لذوقه.

═══════════════════════════════════
🏪 مسار الجملة — أعلى أولوية
═══════════════════════════════════
**متى:** مقهى · كافيه · محل · جملة · عينات · كمية كبيرة · شركة · توريد · مطعم

**ممنوع** تحوّله فوراً بدون تأهيل. اسأل سؤال واحد يجمع الثلاثة:

"ممتاز — نخدم المقاهي والمحلات.
عشان أوصّلك للشخص الصح مباشرة:
اسم المقهى وفي أي مدينة؟ وتقريباً كم كيلو بالشهر؟ وتحضّرون إسبريسو ولا تقطير؟"

**بعد ما يجاوب:**
"تمام، سجّلت التفاصيل. اضغط تحت ويوصلك فريق الجملة ومعهم بياناتك — ما راح تعيد شي.
[💬 تواصل مع فريق الجملة](https://wa.me/966544141466)"

**مقهى واحد يعادل عشرات طلبات التجزئة.**

═══════════════════════════════════
💬 الإحالة للواتساب — ثلاث حالات فقط
═══════════════════════════════════
✅ **حوّل فقط في:** طلب موجود بعينه · مشكلة دفع أو تقنية · جملة (بعد التأهيل)

❌ **جاوب أنت:** الشحن ومدته · الطحن (موقوف — استخدم الرد المعتمد) · طرق الدفع · الفرق بين الأحجام · الأسعار · التوصية · طريقة التحضير · التوفر · كود الخصم

**القاعدة الذهبية: جاوب أولاً، ثم اعرض الواتساب — لا العكس.**
🚫 ممنوع كتابة الرقم نصياً — يطلع مشوّه.

**معلومات عامة (جاوب أنت):**
- الشحن: كل دول الخليج (السعودية، الإمارات، البحرين، الكويت، عُمان، قطر). السعر حسب الوزن، يظهر في صفحة الدفع.
- بعض الباكجات: توصيل مجاني على ريدبوكس
- الدفع: Visa, Mastercard, Apple Pay, مدى, STC Pay

═══════════════════════════════════
🔄 مسارات المحادثة
═══════════════════════════════════

▶ **السؤال الأول:**
"ابشر، عندنا اللي يبدأ معاك صح. كيف تحب قهوتك؟"
CHOICES: [مع الحليب 🥛] [إسبريسو بلاك ☕] [فلتر V60 🫗] [بارد ❄️] [ما أعرف 🤷]

**كشف النية من أول رسالة — اقفز مباشرة:**
| كتب | افعل |
|---|---|
| "لاتيه" / "فلات وايت" / "كورتادو" | مسار الحليب |
| "إسبريسو" / "شوت" | مسار الإسبريسو |
| "V60" / "فلتر" / "تقطير" | مسار V60 |
| "بارد" / "للصيف" / "منعش" | مسار البارد |
| "مبتدئ" / "أول مرة" / "أجرّب" | مسار المبتدئ |
| "هدية" | مسار الهدية |
| "مقهى" / "جملة" | مسار الجملة |
| "xbloom" / "فرنش برس" | مسار V60 + نصيحة الجهاز |
| "في خصم؟" | رد أكواد الخصم (ما فيه كود فعّال) |
| "سفر" / "مكتب" / "ما عندي معدات" | الأظرف |
| "مطحون" / "تطحنونه؟" / "ما عندي مطحنة" | رد الطحن الموقوف + الأظرف |

═══════════════════════════════════
🥛 مسار الحليب — ثلاث نسب، بدون سؤال إضافي
═══════════════════════════════════
**القاعدة:** كل ما زاد الحليب، احتجت حبة أكثف عشان ما تختفي.
كورتادو ١:١ · فلات وايت ١:٣ · لاتيه ١:٥

| قال | التوصية | ليش |
|---|---|---|
| كورتادو / ماكياتو | هاسيندا أو أكيا | حليب قليل، الحلاوة العسلية تبان |
| فلات وايت | بليند أو شوكو لاهوائي | توازن، شوكولاتة تصمد |
| لاتيه / "حليب كثير" | شوكو لاهوائي | الأكثف، ما ينْدفن |
| "مع الحليب" بس | شوكو لاهوائي | الأأمن لكل النسب |

🚫 **المسموح للحليب — أربعة فقط:** شوكو لاهوائي · أكيا · هاسيندا · بليند
**ممنوع منعاً باتاً** أي إثيوبي أو لاهوائي كولومبي فاكهي للحليب.

**مثال (فلات وايت):**
"للفلات وايت، أفضل خيار **شوكو لاهوائي البرازيلي**.

شوكولاتة داكنة وكراميل — يصمد قدام الحليب ويطلع طعمه بدل ما يختفي.

السعر:
• ٢٥٠ جرام — ٥٩.٨٠ ريال
• كيلو — ٢٠٤.٦٢ ريال"

CHOICES: [أخذ ٢٥٠ جرام] [أخذ كيلو] [وريني خيار ثاني]

═══════════════════════════════════
🚫🍋 مسار "ما أحب الحامض"
═══════════════════════════════════
**الكشف:** زر [ما أحب الحامض]، أو عبارات: "حامض" / "حموضة" / "قابض" / "مر" / "ثقيل" / "قهوة عادية" / "مثل المقاهي" / "ما أبغى فواكه"

**القائمة الآمنة — لا تخرج عنها:** أكيا · هاسيندا · بليند · شوكو لاهوائي · كالداس
🚫 ممنوع أي إثيوبي أو لاهوائي كولومبي هنا.

**وأعطِ الحل التقني كمان:**
"وسر صغير: لو أي قهوة طلعت حامضة عندك، اطحن أنعم شوي وارفع حرارة الماء درجتين. أغلب الحموضة المزعجة سببها التحضير مو الحبة."

**مثال:**
"تمام، فهمتك. أرشّحلك **أكيا البرازيلي**.

شوكولاتة، بندق، فول سوداني — صفر حموضة، قوام كلاسيكي مريح.

السعر:
• ٢٥٠ جرام — ٤٢.٥٥ ريال
• كيلو — ١٣٧.٧١ ريال"

CHOICES: [أخذ أكيا] [وريني بديل بنفس الطعم] [تبغى الوصفة؟]

═══════════════════════════════════
🫗 مسار V60 — سؤال واحد فقط
═══════════════════════════════════
**ممنوع** تسأل عن المعدات هنا.

"تحب الفاكهي المنعش ولا الكلاسيكي الشوكولاتي؟"
CHOICES: [فاكهي 🍓] [كلاسيكي 🍫] [ما أحب الحامض] [فاجئني]

← **فاكهي:**
"أرشّحلك **هامبيلا الإثيوبي** — الأشهر عندنا.

مانجو، خوخ، ياسمين — فاكهي أنيق بحموضة خفيفة.

السعر:
• ٢٥٠ جرام — ٥٦.٤٤ ريال
• كيلو — ١٨٤.٥٨ ريال"

CHOICES: [أخذ هامبيلا] [وريني شيلشيلي] [تبغى الوصفة؟]

← **كلاسيكي:** كالداس أو بليند (نفس الصيغة)
← **ما أحب الحامض:** مسار الحموضة
← **فاجئني:** سفاري لاهوائي أو فراولة لاهوائي

═══════════════════════════════════
☕ مسار الإسبريسو
═══════════════════════════════════
"للإسبريسو البلاك، الأفضل **حراز اليمني**.

شوكولاتة داكنة، كراميل، زبيب، بهارات — كافين عالٍ وعمق غني.

السعر:
• ٢٥٠ جرام — ٧٣.٦٠ ريال
• كيلو — ٢٤٤.٩٥ ريال"

CHOICES: [أخذ حراز] [وريني بدائل] [تبغى الوصفة؟]

← بدائل: شوكو لاهوائي (٥٩.٨٠) · كالداس (٦٤.٧٦) · أكيا (٤٢.٥٥)

═══════════════════════════════════
❄️ مسار البارد (V60 مثلج افتراضياً)
═══════════════════════════════════
**قاعدة:** "بارد" / "للصيف" / "منعش" → V60 مثلج تلقائياً بمحاصيل فاكهية.
"كولد برو" حرفياً → محاصيل كثيفة (شوكو لاهوائي، حراز).
🚫 ممنوع تسأله "كولد برو ولا V60 مثلج؟"

"تحب نكهات حمضية منعشة، ولا حلاوة فاكهية صريحة؟"
CHOICES: [حمضي منعش 🍃] [حلو فاكهي 🍑]

← **حمضي منعش:** ريد فروت لاهوائي أو حبحب لاهوائي (٨٩.٧٠ / ٢٥٠ جرام)، أو بكج الموهيتو — ١٩٢.٣١ ريال، ٤ كولومبيات لاهوائية + كوب جدة
← **حلو فاكهي:** خوخ لاهوائي أو جوز الهند لاهوائي (٨٩.٧٠ / ٢٥٠ جرام)، أو بكج الفواكه الصيفية — ١٩٢.١٧ ريال للتنويع

═══════════════════════════════════
🌱 مسار المبتدئ — بكج التذوق هو الافتراضي
═══════════════════════════════════
**ممنوع** ترشيح بكج الموهيتو أو الفواكه الصيفية للمبتدئ. البداية دايماً من بكج التذوق.

"أفضل بداية: **بكج التذوق** — حوالي ١٠٠ ريال.

٤ محاصيل × ١٢٥ جرام (٥٠٠ جرام)

تجرّب أربع شخصيات وتعرف ذايقتك قبل ما تلتزم بكيلو."

CHOICES: [أخذ بكج التذوق A] [أخذ بكج التذوق B] [وش الفرق بينهم؟]

← **وش الفرق:**
"**بكج التذوق A** — أعمق وأكثر فاكهية (١٠٠.٣٤ ريال)
كالداس (شوكولاتة حليب وخوخ) + هاسيندا (عسل وكشمش) + شيلشيلي (خوخ وتوت) + هامبيلا (مانجو وياسمين)

**بكج التذوق B** — أخف وأكثر كلاسيكية (٩٦.٨٩ ريال)
أكيا (شوكولاتة وبندق) + روينزوري (أناناس واستوائي) + شيلشيلي + هاسيندا

لو تميل للفاكهي خذ A، ولو تبغى تبدأ كلاسيكي خذ B."

CHOICES: [أخذ بكج التذوق A] [أخذ بكج التذوق B]

═══════════════════════════════════
🎁 مسار الهدية
═══════════════════════════════════
"من تشتري له يميل لأي نوع؟"
CHOICES: [فاكهي 🌸] [كلاسيكي 🍂] [ما أعرف]

← **فاكهي:** بكج الموهيتو — ١٩٢.٣١ (معه كوب جدة، يساوي ٥٧ ريال لحاله)
← **كلاسيكي:** بكج اسبريسو و V60 — ١٥٣.٧١ (محاصيل من أربع دول)
← **ما أعرف:** بكج التذوق A — ١٠٠.٣٤، الخيار الآمن

مع أي باكج، تقدر تقترح الخلطة الملكية (٣٣.٠١) لو الهدية لبيت.

═══════════════════════════════════
🎯 تكبير السلة — أداة واحدة فقط بعد التوصية
═══════════════════════════════════
**اقترح واحد، ثم اسكت.**

١. **رياضيات الكيلو:** "الكيلو أوفر من ٤ أكياس ٢٥٠ — مثلاً هامبيلا كيلو ١٨٤.٥٨ بدل ٢٢٥.٧٦ لو أخذت ٤ × ٢٥٠، ويكفيك شهر تقريباً." (احسبها من أسعار الكتالوج للمحصول نفسه)
٢. **بكج التذوق:** "قبل ما تلتزم بكيلو، بكج التذوق بحوالي ١٠٠ ريال يعطيك ٤ محاصيل تعرف منها ذايقتك."
٣. **الأظرف (بلا سعر، وفقط لو المحصول له ظرف متوفر):** "ولو تشل قهوتك للمكتب أو السفر، نفس المحصول موجود كأظرف."
٤. **الوصفة:** اعرضها بعد كل توصية — اللي يتعلم يحضّر قهوته منك يرجع لك.

🚫 ممنوع أكثر من اقتراح واحد · ممنوع تكراره لو تجاهله · ممنوع اقتراح قهوة سعودية على مشتري المختصة

═══════════════════════════════════
🤐 اعرف متى تسكت
═══════════════════════════════════
لو الزبون عبّر عن انزعاج ("خلاص" / "بس" / "مضايقني") أو رغبة يتصفح وحده:
رد قصير محترم، **بدون CHOICES**، بدون محاولة إرجاع للمسار.
"تمام، خذ راحتك. أنا هنا لو احتجت شي 🙂"

═══════════════════════════════════
الذكاء النهائي
═══════════════════════════════════
- سؤال واحد فقط في كل رسالة
- توصية واحدة + بديل واحد (إن لزم)
- CHOICES في نهاية الرسالة دايماً
- ممنوع توصية بمنتج مو في الكتالوج أو نافد
- ممنوع اختراع أسعار/كميات/خصومات
- ممنوع كتابة روابط منتجات — النظام يضيفها
- ما فيه كود خصم فعّال — ممنوع اختراع أكواد
- ممنوع ذكر تاريخ انتهاء الخصومات
- ممنوع عرض خدمة الطحن — نبيع حبوب كاملة فقط، والطحن موقوف
- ما فيه خصم على الكيلو — اذكر سعره كما هو
- الأسعار رأسياً بنقاط
- ابقَ سعودي اللهجة ١٠٠٪
- الأظرف تُباع بالراحة، مو بالسعر
- الزبون أولاً، البيع ثانياً
- اقتراح واحد، ثم اسكت`;

// Tool mode: the same prompt without the hardcoded catalog, prices, stock and
// link tables; the model looks products up with search_products and links
// only to URLs the tool returned.
const BAR = '═══════════════════════════════════';
const TOOL_CATALOG_RULES = `${BAR}
🛒 المنتجات والأسعار — من أداة البحث فقط
${BAR}
- **قبل أي توصية أو ذكر سعر أو توفر: استخدم search_products.** لا تعتمد على ذاكرتك.
- الأسماء والأسعار في أمثلة المسارات تحت **للتوضيح فقط وقد تكون قديمة**. السعر المعتمد الوحيد هو اللي ترجعه الأداة.
- اذكر السعر كما رجع من الأداة (شامل الضريبة)، كل حجم على سطر بنقطة.
- ما فيه خصم على الكيلو. لا تذكر أي خصم.
- لا ترشّح منتج available=false. لو الزبون سأله بالاسم: قل إنه غير متوفر حالياً، وابحث عن بديل بنفس النكهات أو الأسلوب، أو ظرفه لو متوفر.
- لا تخترع نكهات أو مكونات باكج أو معلومات غير اللي في نتائج الأداة.
- للحليب: رشّح فقط المنتجات اللي milk=true.
- أي معلومة عن منتج (نكهات، معالجة، منشأ، حموضة، سعر، توفر) — **حتى لو ذكرته قبل في المحادثة** — تحقق منها بالأداة قبل ما تكتبها. لو المعلومة مو موجودة في النتيجة، لا تخمّنها.
- اتبع المسارات وأسئلتها تحت كما هي. الأداة ما تضيف أسئلة: "مع الحليب" بدون تفاصيل → رشّح مباشرة أفضل منتج milk=true.
- لو المنتج غير متوفر أو مو موجود: اعرض البديل المتوفر **في نفس الرد** باسمه ورابطه وسعره، لا تسأل "تبغى بديل؟". مثال: "ظرف فيمتو غير متوفر حالياً. الأقرب له [عنب لاهوائي](رابط) — توت أسود وبرقوق" ثم السعر.
- لا تكتب أي نص قبل استخدام الأداة. ابحث أولاً ثم اكتب ردك كامل.
- الروابط داخل نص الرد فقط، **ممنوع داخل CHOICES**.
- الأظرف تُباع بالراحة، لا تذكر سعرها في الاقتراح إلا لو سأل.

`;
function buildToolPrompt(base) {
  const start = base.indexOf(BAR + '\n💰 الأسعار والخصومات');
  const end = base.indexOf(BAR + '\n🎟️ أكواد الخصم');
  if (start === -1 || end === -1) throw new Error('tool prompt markers missing');
  let out = base.slice(0, start) + TOOL_CATALOG_RULES + base.slice(end);
  out = out.replace(/\*\*لا تكتب روابط منتجات بنفسك أبداً\.\*\*[^\n]*\n[^\n]*\n/,
    '**روابط المنتجات:** اكتب رابط المنتج اللي ترشّحه مرة وحدة بصيغة [اسم المنتج](url)، والـ url من نتائج search_products فقط، للحجم اللي تقترحه (٢٥٠ جرام افتراضياً). أي رابط غيره ينحذف تلقائياً.\n');
  return out;
}
const TOOL_SYSTEM_PROMPT = buildToolPrompt(SYSTEM_PROMPT);

// USD per million tokens. cache_write is the 5-minute TTL rate.
const PRICES = {
  'claude-sonnet-4-6': { in: 3, out: 15, cache_read: 0.3, cache_write: 3.75 }
};
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// Per-turn measurement, stored with the conversation row: tokens, cost and
// where the time went. Vercel Hobby keeps logs for an hour only.
function newMetrics(mode) {
  return { mode, model: MODEL, rounds: 0, in: 0, out: 0, cache_read: 0, cache_write: 0,
    cost_usd: 0, claude_ms: 0, tool_ms: 0, prep_ms: 0, started: Date.now() };
}

function logUsage(u, extra, m) {
  u = u || {};
  console.log('USAGE', JSON.stringify({
    in: u.input_tokens, out: u.output_tokens,
    cache_read: u.cache_read_input_tokens, cache_write: u.cache_creation_input_tokens, ...extra
  }));
  if (!m) return;
  m.rounds += 1;
  m.in += u.input_tokens || 0;
  m.out += u.output_tokens || 0;
  m.cache_read += u.cache_read_input_tokens || 0;
  m.cache_write += u.cache_creation_input_tokens || 0;
  const p = PRICES[m.model];
  if (p) {
    m.cost_usd = +((m.in * p.in + m.out * p.out + m.cache_read * p.cache_read + m.cache_write * p.cache_write) / 1e6).toFixed(6);
  }
}

// The widget can't render markdown tables: a table row becomes a bullet line
// and separator rows disappear. Works line by line, so streaming can use it.
function tableLine(line) {
  const t = line.trim();
  if (!/^\|.*\|$/.test(t)) return line;
  const cells = t.slice(1, -1).split('|').map(c => c.trim()).filter(Boolean);
  if (!cells.length || cells.every(c => /^:?-{2,}:?$/.test(c))) return null;
  return '• ' + cells.join(' — ');
}
function flattenTables(text) {
  return text.split('\n').map(tableLine).filter(l => l !== null).join('\n');
}

// Streamed Claude call: text deltas go to onText as they arrive.
async function timedStream(params, m, onText) {
  const t = Date.now();
  try {
    const stream = anthropic.messages.stream(params);
    stream.on('text', onText);
    return await stream.finalMessage();
  } finally { if (m) m.claude_ms += Date.now() - t; }
}

// Sends completed lines of a reply to the widget while Claude writes. Each
// line gets the same link and dialect filtering as the final reply; nothing
// from "CHOICES:" on is sent (the final reply carries the buttons). If the
// round turns into a tool call, the widget is told to clear what it showed.
function lineStreamer(emit, allowed) {
  let buf = '', sent = 0, stopped = false;
  function flush(line) {
    if (stopped) return;
    if (line.includes('CHOICES:')) { stopped = true; return; }
    const flat = tableLine(line);
    if (flat === null) return;
    emit({ t: 'line', text: enforceSaudi(keepAllowedLinks(flat, allowed)).text });
    sent++;
  }
  return {
    push(delta) {
      buf += delta;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) { flush(buf.slice(0, i)); buf = buf.slice(i + 1); }
    },
    reset() { if (sent) emit({ t: 'reset' }); buf = ''; sent = 0; stopped = false; }
  };
}

// Times one Claude call into m.claude_ms.
async function timedCreate(params, m) {
  const t = Date.now();
  try { return await anthropic.messages.create(params); }
  finally { if (m) m.claude_ms += Date.now() - t; }
}

function textOf(response) {
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

// Hardcoded-catalog mode (prompt v7): links are injected from BEAN_LINKS.
async function chatWithPromptCatalog(messages, m) {
  if (m) m.prep_ms = Date.now() - m.started;
  const response = await timedCreate({
    model: MODEL,
    max_tokens: 800,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: messages.map(x => x && x.role === 'assistant' ? { ...x, content: stripStoreLinks(x.content) } : x)
  }, m);
  logUsage(response.usage, undefined, m);
  return injectProductLinks(stripStoreLinks(textOf(response)));
}

// Product links stay in the body; inside CHOICES a link would make the widget
// drop the button, so links there are reduced to their text.
function finishToolReply(text, allowed) {
  const cut = text.indexOf('CHOICES:');
  const body = cut === -1 ? text : text.slice(0, cut);
  const tail = cut === -1 ? '' : text.slice(cut).replace(/\[([^\]]+)\]\([^)]*\)/g, '[$1]');
  return keepAllowedLinks(flattenTables(body), allowed) + tail;
}

// Tool mode: Claude calls search_products (up to 4 rounds), then answers.
// Only product URLs returned by the tool survive in the reply.
const MAX_TOOL_ROUNDS = 4;
async function chatWithTools(storeId, messages, sessionId, firstName, m, emit) {
  const allowed = new Set();
  const texts = [];

  const convo = messages.map(m => m && m.role === 'assistant' ? { ...m, content: keepAllowedLinks(m.content, null) } : m);
  // Products named in the conversation (newest first, up to 4) are looked up
  // before Claude answers, so facts about them come from the
  // catalog even when Claude would not call the tool on its own.
  // Block 3: a logged-in shopper's purchase history goes in a second,
  // uncached system block; their past products are looked up below so a
  // reorder suggestion uses current price and stock.
  // Independent lookups run together: the database is far from the function.
  const [systemPrompt, mem] = await Promise.all([
    toolPromptFor(storeId),
    memory.forSession(storeId, sessionId, firstName).catch(err => { console.error('memory failed:', err.message); return null; }),
    catalog.load(storeId).catch(() => null)
  ]);
  const system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  if (mem) system.push({ type: 'text', text: mem.prompt });
  const arm = cartArm(storeId, sessionId, mem && mem.customerId);
  if (m) m.cart_arm = arm;
  if (cartOn(arm)) system.push({ type: 'text', text: CART_NOTE });
  if (customerWritesEnglish(messages)) system.push({ type: 'text', text: ENGLISH_NOTE });
  const named = [];
  for (const m of [...convo].reverse()) {
    if (named.length >= 4) break;
    for (const n of await catalog.mentioned(storeId, typeof m.content === 'string' ? m.content : '')) {
      if (!named.includes(n) && named.length < 4) named.push(n);
    }
  }
  if (mem && mem.summary) {
    for (const p of mem.summary.products.slice(0, 2)) {
      for (const n of await catalog.mentioned(storeId, p.name || '')) {
        if (!named.includes(n) && named.length < 5) named.push(n);
      }
    }
  }
  if (named.length && convo.length && convo[convo.length - 1].role === 'user') {
    const out = await catalog.lookup(storeId, named);
    collectUrls(out, allowed);
    convo.push({ role: 'assistant', content: [{ type: 'tool_use', id: 'auto_lookup', name: 'search_products', input: { query: named.join('، '), include_unavailable: true } }] });
    convo.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'auto_lookup', content: JSON.stringify(out) }] });
  }
  if (m) m.prep_ms = Date.now() - m.started;
  for (let round = 0; ; round++) {
    const last = round >= MAX_TOOL_ROUNDS;
    const params = {
      model: MODEL,
      max_tokens: 1200,
      system,
      tools: catalog.TOOLS,
      ...(last ? { tool_choice: { type: 'none' } } : {}),
      messages: convo
    };
    const streamer = emit ? lineStreamer(emit, allowed) : null;
    const response = streamer
      ? await timedStream(params, m, d => streamer.push(d))
      : await timedCreate(params, m);
    logUsage(response.usage, { round, stop: response.stop_reason }, m);
    const text = textOf(response);
    if (text) texts.push(text);
    // The final answer stands alone; text written before a tool call is used
    // only if the final round wrote nothing.
    if (response.stop_reason !== 'tool_use' || last) return finishToolReply(text || texts.join('\n\n'), allowed);
    if (streamer) streamer.reset();
    convo.push({ role: 'assistant', content: response.content });
    const toolStart = Date.now();
    const results = await Promise.all(response.content.filter(b => b.type === 'tool_use').map(async b => {
      let out;
      try { out = await catalog.run(storeId, b.name, b.input); } catch (err) { out = { error: err.message }; }
      collectUrls(out, allowed);
      return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out), ...(out && out.error ? { is_error: true } : {}) };
    }));
    if (m) m.tool_ms += Date.now() - toolStart;
    convo.push({ role: 'user', content: results });
  }
}

module.exports = async (req, res) => {
  const storeId = await applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlPath = req.url.split('?')[0];

  if (urlPath === '/widget.js' && req.method === 'GET') {
    try {
      const widgetPath = path.join(process.cwd(), 'api', 'public', 'widget.js');
      const widgetContent = fs.readFileSync(widgetPath, 'utf8');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(widgetContent);
    } catch (err) {
      return res.redirect(301, 'https://cdn.jsdelivr.net/gh/ahmedbinmahfoud-glitch/guider-app@main/api/public/widget.js');
    }
  }

  if (urlPath === '/api/salla/callback' && req.method === 'GET') {
    const code = new URL(req.url, 'https://guider-app.vercel.app').searchParams.get('code');
    if (!code) return res.status(400).send('Missing authorization code');

    try {
      const tokenBody = querystring.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.SALLA_CLIENT_ID,
        client_secret: process.env.SALLA_CLIENT_SECRET,
        redirect_uri: 'https://guider-app.vercel.app/api/salla/callback'
      });

      const tokenResponse = await httpsPost('accounts.salla.sa', '/oauth2/token', {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(tokenBody)
      }, tokenBody);

      if (!tokenResponse.access_token) {
        console.error('Token exchange failed:', tokenResponse);
        return res.status(500).send(`<pre>Token exchange error:\n${JSON.stringify(tokenResponse, null, 2)}</pre>`);
      }

      const accessToken = tokenResponse.access_token;
      const refreshToken = tokenResponse.refresh_token || null;
      const expiresIn = tokenResponse.expires_in || null;
      const scope = tokenResponse.scope || null;

      let storeId = null, storeName = null, storeDomain = null, plan = 'free';

      try {
        const storeInfo = await httpsGet('api.salla.dev', '/admin/v2/store/info', {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        });
        if (storeInfo && storeInfo.data) {
          storeId = String(storeInfo.data.id || '');
          storeName = storeInfo.data.name || null;
          storeDomain = storeInfo.data.domain || null;
          plan = storeInfo.data.plan || 'free';
        }
      } catch (infoErr) {
        console.error('Store info fetch failed (continuing anyway):', infoErr.message);
      }

      if (!storeId) storeId = `unknown_${Date.now()}`;

      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

      try {
        await saveStoreToken({
          salla_store_id: storeId,
          store_name: storeName,
          store_domain: storeDomain,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          scope: scope,
          is_active: true,
          plan: plan,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        console.log('Store token saved:', storeId, storeName);
      } catch (dbErr) {
        console.error('Failed to save store token to DB:', dbErr.message);
        return res.status(500).send(`
          <html dir="rtl"><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:auto">
            <h2>التثبيت جزئي</h2>
            <p>تم استلام التوكن من سلة لكن فشل حفظه في قاعدة البيانات.</p>
            <p><b>Store ID:</b> ${storeId}</p>
            <p><b>Error:</b> ${dbErr.message}</p>
          </body></html>
        `);
      }

      return res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head><meta charset="UTF-8"><title>تم التثبيت بنجاح</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f7; }
          .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); text-align: center; }
          h1 { color: #1d1d1f; margin: 10px 0 20px; }
          .info { background: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: right; }
          code { background: #e5e5ea; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
          .note { color: #86868b; font-size: 14px; margin-top: 30px; }
        </style></head>
        <body><div class="card">
          <h1>تم تثبيت Guider بنجاح</h1>
          <div class="info">
            <p><b>المتجر:</b> ${storeName || 'غير معروف'}</p>
            <p><b>معرف المتجر:</b> <code>${storeId}</code></p>
            <p><b>الباقة:</b> ${plan}</p>
          </div>
          <p class="note">تقدر تغلق هذه الصفحة وترجع لمتجرك.</p>
        </div></body></html>
      `);

    } catch (err) {
      console.error('OAuth callback error:', err);
      return res.status(500).send(`<pre>Callback error: ${err.message}</pre>`);
    }
  }

  // /order-webhook is the public app's URL, /webhook the private app's.
  if ((urlPath === '/api/salla/webhook' || urlPath === '/api/salla/order-webhook') && req.method === 'POST') {
    try {
      if (!verifySallaWebhook(req)) {
        console.warn('Invalid Salla webhook token');
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
      }
      const eventType = payload.event || 'unknown';
      const merchant = String(payload.merchant || 'unknown');
      console.log('Salla webhook', eventType, merchant);
      if (eventType === 'app.store.authorize') await handleStoreAuthorize(payload);
      else if (eventType === 'app.uninstalled') { await handleAppUninstalled(payload); await logSallaEvent(merchant, eventType, payload); }
      else if (eventType.startsWith('order.')) await logSallaOrder(merchant, eventType, payload);
      else if (eventType.startsWith('product.')) { await handleProductEvent(merchant, eventType, payload); await logSallaEvent(merchant, eventType, payload); }
      else await logSallaEvent(merchant, eventType, payload);
      return res.status(200).json({ received: true, event: eventType });
    } catch (err) {
      console.error('Webhook handler error:', err.message);
      return res.status(200).json({ received: true });
    }
  }

  if (urlPath === '/api/cron/refresh-tokens' && req.method === 'GET') {
    const result = await refreshExpiringTokens();
    result.sync = await syncAllStores();
    const syncFailed = result.sync.some(x => !x.ok);
    return res.status(result.failed || syncFailed ? 500 : 200).json(result);
  }

  // The widget reports which Salla customer is browsing, on every page
  // including checkout and thank-you. This is the join key for attribution.
  if (urlPath === '/api/identify' && req.method === 'POST') {
    if (!storeId) return res.status(403).json({ error: 'Forbidden origin' });
    const { sessionId, customerId } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (typeof sessionId !== 'string' || !/^session_[\w]{6,60}$/.test(sessionId) ||
        !/^\d{1,20}$/.test(String(customerId || ''))) {
      return res.status(400).json({ error: 'invalid' });
    }
    if (rateLimited(null, ip)) return res.status(429).json({ error: 'rate limited' });
    const r = await sb('POST', '/session_identities?on_conflict=store_id,session_id,customer_id', {
      store_id: storeId, session_id: sessionId, customer_id: String(customerId),
      last_seen: new Date().toISOString()
    }, 'resolution=merge-duplicates,return=minimal');
    if (!r.ok) console.error('identify insert failed:', r.status);
    return res.status(204).end();
  }

  // Cart button events from the widget: add, add_failed, checkout. Stored in
  // salla_events with the session and product only.
  if (urlPath === '/api/cart-event' && req.method === 'POST') {
    if (!storeId) return res.status(403).json({ error: 'Forbidden origin' });
    const { sessionId, productId, action } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (typeof sessionId !== 'string' || !/^session_[\w]{6,60}$/.test(sessionId) ||
        !['add', 'add_failed', 'checkout'].includes(action) ||
        (productId != null && !/^\d{1,20}$/.test(String(productId)))) {
      return res.status(400).json({ error: 'invalid' });
    }
    if (rateLimited(sessionId, ip)) return res.status(429).json({ error: 'rate limited' });
    const r = await sb('POST', '/salla_events', {
      store_id: storeId, event_type: 'widget.cart_' + action,
      raw_payload: { session_id: sessionId, product_id: productId == null ? null : String(productId) }
    }, 'return=minimal');
    if (!r.ok) console.error('cart event insert failed:', r.status);
    return res.status(204).end();
  }

  if (urlPath === '/api/index' && req.method === 'POST') {
    try {
      if (!storeId) return res.status(403).json({ error: 'Forbidden origin' });

      const { messages, sessionId, firstName, ctx } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array required' });
      }

      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (rateLimited(sessionId, ip)) {
        return res.json({ reply: 'خذ نفس بسيط وجرب بعد شوي 🙂' });
      }

      const contextSaved = saveVisitContext(storeId, sessionId, ctx, req.headers || {}).catch(() => {});
      const tools = toolsEnabled(storeId);
      const metrics = newMetrics(tools ? 'tools' : 'prompt');
      // Streaming (tool mode): newline-delimited JSON events — {t:'line'}
      // while Claude writes, {t:'reset'} if a round became a tool call, then
      // {t:'done', reply} with the final, fully filtered reply.
      const streaming = tools && req.body.stream === true;
      let emit = null;
      if (streaming) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        emit = ev => {
          if (ev.t === 'line' && !metrics.first_line_ms) metrics.first_line_ms = Date.now() - metrics.started;
          res.write(JSON.stringify(ev) + '\n');
        };
      }
      const draft = tools
        ? await chatWithTools(storeId, messages, sessionId, firstName, metrics, emit)
        : await chatWithPromptCatalog(messages, metrics);
      // Deterministic dialect pass; every replacement is logged so the
      // violation rate can be tracked.
      const { text: reply, changes: dialectFixes } = enforceSaudi(draft);
      if (dialectFixes.length) console.log('DIALECT', JSON.stringify({ storeId, fixes: dialectFixes }));

      const updatedMessages = [...messages, { role: 'assistant', content: reply }];
      const { recommendation, reached } = detectRecommendation(updatedMessages);
      const dropOff = detectDropOffStep(updatedMessages);
      const { started, ...usage } = metrics;
      usage.dialect_fixes = dialectFixes.reduce((n, c) => n + c.count, 0);
      const latencyMs = Date.now() - started;
      console.log('TURN', JSON.stringify({ storeId, latency_ms: latencyMs, ...usage }));

      // The final reply goes out before logging, so the shopper doesn't wait
      // for the database; the connection closes once the row is written.
      const cart = cartOn(metrics.cart_arm);
      if (streaming) emit({ t: 'done', reply, cart });

      // Regression replays (scripts/regression.js) are never logged.
      if (sessionId && !String(sessionId).startsWith('session_regress_')) {
        await logConversation(storeId, sessionId, updatedMessages, recommendation, reached, dropOff, usage, latencyMs);
      }

      await contextSaved;
      if (streaming) return res.end();
      return res.json({ reply, cart });
    } catch (err) {
      console.error('Chat error:', err);
      if (res.headersSent) { res.write(JSON.stringify({ t: 'error' }) + '\n'); return res.end(); }
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
};
