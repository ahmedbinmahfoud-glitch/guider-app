const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ============================================
// PROMOTIONS — single source of truth for every active discount.
// When the kilo campaign ends (end of September), set active:false.
// ============================================
const PROMOTIONS = {
  KILO_DISCOUNT: { active: true, percent: 15 },
  PACKAGES: {
    'بكج التذوق A':       { was: 139.15, now: 99.00,  off: 29 },
    'بكج التذوق B':       { was: 131.10, now: 99.00,  off: 24 },
    'بكج اسبريسو وتقطير': { was: 181.01, now: 134.00, off: 26 },
    'بكج الموهيتو':       { was: 310.50, now: 238.05, off: 23 }
  },
  EQUIPMENT: { 'شنطة تحضير V60': { was: 350.00, now: 249.00, off: 29 } },
  D10: {
    code: 'D10', percent: 10,
    appliesTo:    ['125 جرام', '250 جرام', 'الأظرف', 'كوب جدة', 'الأكواب الورقية'],
    excludedFrom: ['الكيلو', 'الباكجات', 'شنطة V60']
  }
};

// Out of stock: present in store, not buyable. Never recommend.
const OUT_OF_STOCK = [
  'يرقاتشيف', 'قوجي كورما', 'خوخ إندونيسي', 'تروبيكال', 'يلوفروت',
  'فيمتو', 'بكج V60', 'بكج الفواكه الصيفية'
];

// Out-of-stock beans that DO have an in-stock drip bag
const BAG_RESCUE = {
  'فيمتو': { bag: 'ظرف فيمتو', price: 38, exact: true },
  'خوخ إندونيسي': { bag: 'ظرف خوخ', price: 40, exact: false }
};

const BEAN_LINKS = {
  'أكيا': { '125': 'https://driponcoffeesa.com/ar/?product_id=179239006', '250': 'https://driponcoffeesa.com/ar/?product_id=550675919', '1000': 'https://driponcoffeesa.com/ar/?product_id=1639093607' },
  'هامبيلا': { '125': 'https://driponcoffeesa.com/ar/?product_id=1189786475', '250': 'https://driponcoffeesa.com/ar/?product_id=884098473', '1000': 'https://driponcoffeesa.com/ar/?product_id=1109773747' },
  'شيلشيلي': { '125': 'https://driponcoffeesa.com/ar/?product_id=1375643944', '250': 'https://driponcoffeesa.com/ar/?product_id=573186918' },
  'هاسيندا': { '125': 'https://driponcoffeesa.com/ar/?product_id=1544794708', '250': 'https://driponcoffeesa.com/ar/?product_id=1077689058', '1000': 'https://driponcoffeesa.com/ar/?product_id=109623881' },
  'بليند': { '125': 'https://driponcoffeesa.com/ar/?product_id=676285314', '250': 'https://driponcoffeesa.com/ar/?product_id=805711755', '1000': 'https://driponcoffeesa.com/ar/?product_id=1021371370' },
  'حراز لاهوائي': { '125': 'https://driponcoffeesa.com/ar/?product_id=1132798178', '250': 'https://driponcoffeesa.com/ar/?product_id=1309456195', '1000': 'https://driponcoffeesa.com/ar/?product_id=1490403147' },
  'حراز': { '125': 'https://driponcoffeesa.com/ar/?product_id=597219964', '250': 'https://driponcoffeesa.com/ar/?product_id=928636193', '1000': 'https://driponcoffeesa.com/ar/?product_id=494621956' },
  'كالداس': { '125': 'https://driponcoffeesa.com/ar/?product_id=1982513029', '250': 'https://driponcoffeesa.com/ar/?product_id=1616996217', '1000': 'https://driponcoffeesa.com/ar/?product_id=1732360125' },
  'روينزوري': { '125': 'https://driponcoffeesa.com/ar/?product_id=461345204', '250': 'https://driponcoffeesa.com/ar/?product_id=2131201335', '1000': 'https://driponcoffeesa.com/ar/?product_id=1611659413' },
  'ماناناسي': { '125': 'https://driponcoffeesa.com/ar/?product_id=917455515', '250': 'https://driponcoffeesa.com/ar/?product_id=514090908', '1000': 'https://driponcoffeesa.com/ar/?product_id=40463200' },
  'ريماسيلا': { '125': 'https://driponcoffeesa.com/ar/?product_id=845267524' },
  'شوكو لاهوائي': { '125': 'https://driponcoffeesa.com/ar/?product_id=1818139739', '250': 'https://driponcoffeesa.com/ar/?product_id=617209053', '1000': 'https://driponcoffeesa.com/ar/?product_id=682011405' },
  'ديكاف': { '125': 'https://driponcoffeesa.com/ar/?product_id=802506925', '250': 'https://driponcoffeesa.com/ar/?product_id=1860792230', '1000': 'https://driponcoffeesa.com/ar/?product_id=1435551065' },
  'هوليستن': { '125': 'https://driponcoffeesa.com/ar/?product_id=436985654', '250': 'https://driponcoffeesa.com/ar/?product_id=853914068', '1000': 'https://driponcoffeesa.com/ar/?product_id=385570447' },
  'كوتون كاندي': { '125': 'https://driponcoffeesa.com/ar/?product_id=873953855', '250': 'https://driponcoffeesa.com/ar/?product_id=429963774', '1000': 'https://driponcoffeesa.com/ar/?product_id=742068134' },
  'ريد فروت': { '125': 'https://driponcoffeesa.com/ar/?product_id=1302026197', '250': 'https://driponcoffeesa.com/ar/?product_id=385894034', '1000': 'https://driponcoffeesa.com/ar/?product_id=163951245' },
  'باشن فروت': { '125': 'https://driponcoffeesa.com/ar/?product_id=2080600309', '250': 'https://driponcoffeesa.com/ar/?product_id=1906499867', '1000': 'https://driponcoffeesa.com/ar/?product_id=1903029223' },
  'كوكونت ليمونيد': { '125': 'https://driponcoffeesa.com/ar/?product_id=1725591956', '250': 'https://driponcoffeesa.com/ar/?product_id=1337744406', '1000': 'https://driponcoffeesa.com/ar/?product_id=1727965537' },
  'جوز الهند': { '125': 'https://driponcoffeesa.com/ar/?product_id=1412954247', '250': 'https://driponcoffeesa.com/ar/?product_id=954527786', '1000': 'https://driponcoffeesa.com/ar/?product_id=1829208895' },
  'حبحب': { '125': 'https://driponcoffeesa.com/ar/?product_id=1082464268', '250': 'https://driponcoffeesa.com/ar/?product_id=1961519208' },
  'عنب': { '125': 'https://driponcoffeesa.com/ar/?product_id=1940452031', '250': 'https://driponcoffeesa.com/ar/?product_id=938446689', '1000': 'https://driponcoffeesa.com/ar/?product_id=566481854' },
  'خوخ': { '250': 'https://driponcoffeesa.com/ar/?product_id=415678470', '1000': 'https://driponcoffeesa.com/ar/?product_id=1398968884' },
  'الخلطة الملكية': { '250': 'https://driponcoffeesa.com/ar/?product_id=462737608' },
  'خلطة السلطان': { '250': 'https://driponcoffeesa.com/ar/?product_id=1767920429' }
};

const OTHER_LINKS = {
  'بكج التذوق A': 'https://driponcoffeesa.com/ar/?product_id=1505204168',
  'بكج التذوق B': 'https://driponcoffeesa.com/ar/?product_id=1787882946',
  'بكج الموهيتو': 'https://driponcoffeesa.com/ar/?product_id=177420306',
  'بكج اسبريسو و تقطير': 'https://driponcoffeesa.com/ar/?product_id=1668503197',
  'كوب جدة': 'https://driponcoffeesa.com/ar/?product_id=902891861',
  'شنطة تحضير': 'https://driponcoffeesa.com/ar/?product_id=816042725',
  'أكواب ورقية': 'https://driponcoffeesa.com/ar/?product_id=1202439196'
};

const BAG_LINKS = {
  'ظرف هامبيلا': 'https://driponcoffeesa.com/ar/?product_id=810532892',
  'ظرف فيلا سيبرس': 'https://driponcoffeesa.com/ar/?product_id=344293906',
  'ظرف هاسيندا': 'https://driponcoffeesa.com/ar/?product_id=985621265',
  'ظرف ريفنسيلا': 'https://driponcoffeesa.com/ar/?product_id=1758610448',
  'ظرف حراز لاهوائي': 'https://driponcoffeesa.com/ar/?product_id=379441164',
  'ظرف حراز': 'https://driponcoffeesa.com/ar/?product_id=519382295',
  'ظرف روينزوري': 'https://driponcoffeesa.com/ar/?product_id=1294468630',
  'ظرف كالداس': 'https://driponcoffeesa.com/ar/?product_id=1469692171',
  'ظرف حبحب': 'https://driponcoffeesa.com/ar/?product_id=96246282',
  'ظرف ريد فروت': 'https://driponcoffeesa.com/ar/?product_id=735476489',
  'ظرف عنب': 'https://driponcoffeesa.com/ar/?product_id=1577671688',
  'ظرف كوتون كاندي': 'https://driponcoffeesa.com/ar/?product_id=204225807',
  'ظرف ماناناسي': 'https://driponcoffeesa.com/ar/?product_id=843521550',
  'ظرف شوكو': 'https://driponcoffeesa.com/ar/?product_id=1618673421',
  'ظرف كوكونت ليمونيد': 'https://driponcoffeesa.com/ar/?product_id=1152430339',
  'ظرف أكيا': 'https://driponcoffeesa.com/ar/?product_id=420311809',
  'ظرف باشن فروت': 'https://driponcoffeesa.com/ar/?product_id=2103129351',
  'ظرف فيمتو': 'https://driponcoffeesa.com/ar/?product_id=595465734',
  'ظرف هوليستن': 'https://driponcoffeesa.com/ar/?product_id=1368520453',
  'ظرف خوخ': 'https://driponcoffeesa.com/ar/?product_id=904907067',
  'ظرف ديكاف': 'https://driponcoffeesa.com/ar/?product_id=237341497',
  'ظرف جوز هند': 'https://driponcoffeesa.com/ar/?product_id=1012886584',
  'ظرف شيلشيلي': 'https://driponcoffeesa.com/ar/?product_id=1651658047'
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
    let size = '250';
    if (/كيلو|١٠٠٠|1000/.test(body) && sizes['1000']) size = '1000';
    else if (/١٢٥|125/.test(body) && sizes['125']) size = '125';
    linkOnce(bean, sizes[size] || sizes['250'] || Object.values(sizes)[0]);
  }
  return body + tail;
}

// Pre-filled WhatsApp link for qualified wholesale leads
function buildWholesaleLink(details) {
  const msg = 'طلب جملة | ' + (details || 'من مساعد Guider');
  return 'https://wa.me/966549111266?text=' + encodeURIComponent(msg);
}

// ---------- Security ----------
const ALLOWED_ORIGINS = [
  'https://driponcoffeesa.com',
  'https://www.driponcoffeesa.com'
];

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const ok = ALLOWED_ORIGINS.includes(origin);
  if (ok) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return ok;
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

async function logConversation(sessionId, messages, recommendation, reachedRecommendation, dropOffStep) {
  try {
    const body = JSON.stringify({
      session_id: sessionId,
      store_id: 'dripon',
      messages: messages,
      recommendation: recommendation || null,
      reached_recommendation: reachedRecommendation || false,
      drop_off_step: dropOffStep || null
    });
    const url = new URL(`${SUPABASE_URL}/rest/v1/conversations`);
    const options = {
      hostname: url.hostname,
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
        res.on('end', () => { resolve(); });
      });
      req.on('error', () => { resolve(); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error('Logging failed:', err.message);
  }
}

function verifySallaWebhook(req) {
  const expectedSecret = process.env.SALLA_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('SALLA_WEBHOOK_SECRET not configured');
    return false;
  }
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const sallaSignature = req.headers['x-salla-signature'] || '';
  return token === expectedSecret || sallaSignature === expectedSecret;
}

function extractOrderData(payload) {
  const data = payload.data || payload;
  const items = data.items || data.products || [];
  const productNames = items.map(item => item.name || item.product_name || '').filter(Boolean);
  const customer = data.customer || {};
  const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
    || customer.name || null;
  return {
    salla_order_id: String(data.id || ''),
    salla_order_reference: data.reference_id || data.order_number || null,
    customer_id: customer.id ? String(customer.id) : null,
    customer_email: customer.email || null,
    customer_phone: customer.mobile || customer.phone || null,
    customer_name: customerName,
    customer_city: customer.city || (data.shipping && data.shipping.address && data.shipping.address.city) || null,
    total_amount: parseFloat(data.total && data.total.amount) || parseFloat(data.amounts && data.amounts.total && data.amounts.total.amount) || 0,
    currency: (data.total && data.total.currency) || (data.amounts && data.amounts.total && data.amounts.total.currency) || 'SAR',
    shipping_cost: parseFloat(data.shipping_cost) || parseFloat(data.amounts && data.amounts.shipping_cost && data.amounts.shipping_cost.amount) || 0,
    order_status: (data.status && data.status.name) || data.status || null,
    payment_status: data.payment_method || (data.payment && data.payment.status) || null,
    payment_method: data.payment_method || null,
    items_count: items.length,
    product_names: productNames
  };
}

async function attributeToSession(orderData) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { session_id: null, method: 'unknown', confidence: 'none' };
  }
  return { session_id: null, method: 'unknown', confidence: 'none' };
}

async function logSallaOrder(eventType, payload) {
  try {
    const orderData = extractOrderData(payload);
    const attribution = await attributeToSession(orderData);
    const body = JSON.stringify({
      store_id: 'dripon',
      event_type: eventType,
      event_timestamp: new Date().toISOString(),
      salla_order_id: orderData.salla_order_id,
      salla_order_reference: orderData.salla_order_reference,
      customer_id: orderData.customer_id,
      customer_email: orderData.customer_email,
      customer_phone: orderData.customer_phone,
      customer_name: orderData.customer_name,
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
      raw_payload: payload
    });
    const url = new URL(`${SUPABASE_URL}/rest/v1/orders`);
    return new Promise((resolve) => {
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) console.error('Supabase orders insert failed:', res.statusCode, data);
          resolve();
        });
      });
      req.on('error', (err) => { console.error('Order log error:', err.message); resolve(); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error('logSallaOrder failed:', err.message);
  }
}

async function logSallaEvent(eventType, payload) {
  try {
    const body = JSON.stringify({
      store_id: 'dripon',
      event_type: eventType,
      raw_payload: payload,
      processed: false
    });
    const url = new URL(`${SUPABASE_URL}/rest/v1/salla_events`);
    return new Promise((resolve) => {
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      });
      req.on('error', () => resolve());
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error('logSallaEvent failed:', err.message);
  }
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
- ✅ [💬 تواصل على واتساب](https://wa.me/966549111266)
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
⚙️ خيارات الطحن — سطر خدمة، مو سؤال
═══════════════════════════════════
**الخيارات المتوفرة: V60 و إسبريسو فقط.** ما فيه فرنش ولا تركي.

**ممنوع** تسأل "عندك مطحنة؟" — يضيّع دور كامل.
بعد أول توصية بن، أضف سطر واحد فقط:

"تجيك حبوب كاملة. ولو ما عندك مطحنة، تقدر تختار الطحن (V60 أو إسبريسو) من صفحة المنتج."

لا تكرره.

═══════════════════════════════════
💰 الأسعار والخصومات
═══════════════════════════════════
**كل أسعار الكيلو عليها خصم ١٥٪.** اذكر دايماً السعر بعد الخصم والأصلي معاً:
"الكيلو ١٤١.٧٤ ريال بدل ١٦٦.٧٥ (خصم ١٥٪)"

🚫 **ممنوع ذكر تاريخ انتهاء أي خصم.**
🚫 ممنوع اختراع أسعار أو خصومات.

═══════════════════════════════════
☕ الكتالوج — المحاصيل المتوفرة
═══════════════════════════════════
(كل الأسعار شاملة ضريبة ١٥٪ · سعر الكيلو = بعد الخصم / الأصلي)

▼ **للحليب والإسبريسو — كلاسيكيات شوكولاتية:**
- أكيا (برازيل) | ١٢٥: ٣٣.٥٥ | ٢٥٠: ٤٢.٥٥ | كيلو: ١١٧.٠٦ بدل ١٣٧.٧١ | شوكولاتة، بندق، فول سوداني
- هاسيندا (كولومبيا، عسلي) | ١٢٥: ٣٣.٥٥ | ٢٥٠: ٤٣.٧٠ | كيلو: ١٢١.٢١ بدل ١٤٢.٦٠ | عسل، كشمش أحمر | ⭐ الأشهر
- بليند | ١٢٥: ٣٥.٤٥ | ٢٥٠: ٤٩.٤٥ | كيلو: ١٣٥.٨٧ بدل ١٥٩.٨٥ | جوز، عنب أخضر، قرفة
- شوكو لاهوائي (برازيل) | ١٢٥: ٣٨.٤٣ | ٢٥٠: ٥٩.٨٠ | كيلو: ١٧٣.٩٣ بدل ٢٠٤.٦٢ | شوكولاتة داكنة، كراميل | ⭐ الأفضل للحليب

▼ **إسبريسو بلاك:**
- حراز (يمن) | ١٢٥: ٤٦.١٠ | ٢٥٠: ٧٣.٦٠ | كيلو: ٢٠٨.٢١ بدل ٢٤٤.٩٥ | شوكولاتة، كراميل، زبيب، بهارات

▼ **V60 فاكهي أنيق:**
- هامبيلا (إثيوبيا) | ١٢٥: ٣٤.٨١ | ٢٥٠: ٥٠.٦٠ | كيلو: ١٤١.٧٤ بدل ١٦٦.٧٥ | فواكه حمراء، مانجو، ياسمين | ⭐ الأشهر
- شيلشيلي (إثيوبيا) | ١٢٥: ٣٦.٢٣ | ٢٥٠: ٥٢.٩٠ | فاكهي خفيف، زهري، خوخ، توت بري

▼ **V60 كلاسيكي:**
- روينزوري (أوغندا) | ١٢٥: ٣٢.٨٦ | ٢٥٠: ٤٣.٧٠ | كيلو: ١٢١.٢١ بدل ١٤٢.٦٠ | أناناس، برقوق، استوائي
- ماناناسي (أوغندا) | ١٢٥: ٣٧.٤١ | ٢٥٠: ٥١.٧٥ | كيلو: ١٥٠.٠١ بدل ١٧٦.٤٨ | شاي أسود، مشمش، باشن فروت
- كالداس (كولومبيا) | ١٢٥: ٤٠.٥٧ | ٢٥٠: ٦٣.٢٥ | كيلو: ١٨٢.٧٩ بدل ٢١٥.٠٥ | شوكولاتة حليب، شاي أسود، فواكه مجففة
- ريماسيلا (كوستاريكا) | ١٢٥: ٣٩.٠٧ | فواكه استوائية، بابايا، أناناس

▼ **V60 فاكهي جريء (لاهوائي كولومبي):**
- عنب لاهوائي | ١٢٥: ٦٠.٠٥ | ٢٥٠: ٨٩.٧٠ | كيلو: ٢٩٢.٨٢ بدل ٣٤٤.٥١ | عنب، كيوي
- خوخ لاهوائي | ٢٥٠: ٨٩.٧٠ | كيلو: ٢٩٢.٨٢ بدل ٣٤٤.٥١ | خوخ، فراولة
- حبحب لاهوائي | ١٢٥: ٦٠.٠٥ | ٢٥٠: ٨٩.٧٠
- هوليستن لاهوائي | ١٢٥: ٦٠.٠٥ | ٢٥٠: ٨٩.٧٠ | كيلو: ٢٩٢.٨٢ بدل ٣٤٤.٥١ | عنب، كيوي
- كوتون كاندي لاهوائي | ١٢٥: ٦٠.٠٥ | ٢٥٠: ٨٩.٧٠ | كيلو: ٢٩٢.٨٢ بدل ٣٤٤.٥١ | حمضيات، برتقال، كراميل
- ريد فروت لاهوائي | ١٢٥: ٦٠.٠٥ | ٢٥٠: ٨٩.٧٠ | كيلو: ٢٩٢.٨٢ بدل ٣٤٤.٥١ | فانيلا، ليمون، فواكه حمراء
- جوز الهند لاهوائي | ١٢٥: ٦٠.٠٥ | ٢٥٠: ٨٩.٧٠ | كيلو: ٢٩٢.٨٢ بدل ٣٤٤.٥١ | جوز هند، كراميل، أناناس
- كوكونت ليمونيد لاهوائي | ١٢٥: ٦٠.٠٥ | ٢٥٠: ٨٩.٧٠ | كيلو: ٢٩٢.٨٢ بدل ٣٤٤.٥١ | ليمون، فانيلا، جوز هند
- باشن فروت لاهوائي | ١٢٥: ٦٠.٢٤ | ٢٥٠: ٩٦.٦٠ | كيلو: ٣٢٤.٤٤ بدل ٣٨١.٧٠
- حراز لاهوائي (يمن، نادر) | ١٢٥: ٦٥.٦٢ | ٢٥٠: ٩٥.٤٥ | كيلو: ٣٣٣.٨٩ بدل ٣٩٢.٨٢ | كميات محدودة

▼ **خالي الكافيين:**
- ديكاف كولومبيا | ١٢٥: ٣٩.٠٧ | ٢٥٠: ٥٨.٦٥ | كيلو: ١٧١.٢٨ بدل ٢٠١.٥٠ | سكر بني، توابل

▼ **القهوة السعودية والتركية (منتجان جاهزان):**
- الخلطة الملكية — قهوتنا السعودية | ٢٥٠: ٣٣.٣٥
- خلطة السلطان — قهوتنا التركية (مطحونة جاهزة) | ٢٥٠: ٢٥.٣٠

═══════════════════════════════════
🎁 الباكجات المتوفرة
═══════════════════════════════════

**١. بكج التذوق A** — ٩٩ ريال (كان ١٣٩.١٥، خصم ٢٩٪)
- ٤ محاصيل × ١٢٥ جرام = ٥٠٠ جرام + ظرفين قهوة + أكواب
- كالداس + هاسيندا + شيلشيلي + هامبيلا
- الاتجاه: أعمق وأكثر فاكهية
- توصيل مجاني على ريدبوكس

**٢. بكج التذوق B** — ٩٩ ريال (كان ١٣١.١٠، خصم ٢٤٪)
- ٤ محاصيل × ١٢٥ جرام = ٥٠٠ جرام + ظرفين قهوة + أكواب
- أكيا + روينزوري + شيلشيلي + هاسيندا
- الاتجاه: أخف وأكثر كلاسيكية
- توصيل مجاني على ريدبوكس

**٣. بكج اسبريسو و تقطير** — ١٣٤ ريال (كان ١٨١.٠١، خصم ٢٦٪)
- ٣ محاصيل × ٢٥٠ جرام = ٧٥٠ جرام
- أكيا + هامبيلا + روينزوري
- هدية: قهوة سعودية (الخلطة الملكية) + ٧ أكواب ورقية
- توصيل مجاني على ريدبوكس

**٤. بكج الموهيتو** — ٢٣٨.٠٥ ريال (كان ٣١٠.٥٠، خصم ٢٣٪)
- ٤ محاصيل كولومبية لاهوائية × ١٢٥ جرام = ٥٠٠ جرام
- جوز هند وليمون + باشن فروت + كوتون كاندي + هوليستن
- هدية: كوب جدة الإصدار المحدود
- توصيل مجاني على ريدبوكس

═══════════════════════════════════
✉️ الأظرف — قهوة مقطّرة جاهزة (٥ أكواب للعلبة)
═══════════════════════════════════
كيس صغير بفلتر مدمج. تحطه على الكوب، تصب ماء حار، يطلع كوب V60 احترافي بـ٣ دقايق بدون معدات.

▼ **٣٤.٠١ ريال:** ظرف هامبيلا · ظرف شيلشيلي · ظرف أكيا · ظرف هاسيندا · ظرف روينزوري · ظرف ريفنسيلا · ظرف فيلا سيبرس
▼ **٣٦ ريال:** ظرف ماناناسي · ظرف ديكاف
▼ **٣٨ ريال:** ظرف كالداس · ظرف شوكو · ظرف فيمتو
▼ **٤٠ ريال:** ظرف حراز · ظرف حبحب · ظرف ريد فروت · ظرف عنب · ظرف كوتون كاندي · ظرف باشن فروت · ظرف جوز هند · ظرف هوليستن · ظرف خوخ
▼ **٤١ ريال:** ظرف كوكونت ليمونيد
▼ **٤٣ ريال:** ظرف حراز لاهوائي

**❌ لا تذكر سعر الأظرف في الاقتراحات.** بِع الراحة، مو السعر.

**سبع إشارات تشغّل اقتراح الأظرف:**
سفر · مكتب · ما عندي معدات · ما عندي وقت · مبتدئ · هدية بسيطة · أبغى أجرّب

**Cross-sell بعد ترشيح كيلو حبوب (مرة واحدة، بدون سعر):**
"ولو تشل قهوتك للمكتب أو السفر، نفس المحصول موجود كأظرف — تفتح وتصب ماء حار وبس."

═══════════════════════════════════
🛠️ المعدات
═══════════════════════════════════
- شنطة تحضير V60 كاملة + محصول مجاني — ٢٤٩ ريال (كانت ٣٥٠، خصم ٢٩٪)
- كوب جدة الإصدار المحدود — ٥٧.٠٤ ريال (١٢ أونص)
- أكواب ورقية دريب اون ١٠ حبة — ١١.٠١ ريال

═══════════════════════════════════
📦 المنتجات النافدة — لا ترشّحها أبداً
═══════════════════════════════════
**نافد حالياً:** يرقاتشيف · قوجي كورما · خوخ إندونيسي · تروبيكال · يلوفروت · فيمتو · بكج V60 · بكج الفواكه الصيفية

🚫 ممنوع ترشيحها في أي مسار.

✅ لو سأل عنها بالاسم، وضّح إنها خلصت واعرض البديل:

| النافد | البديل |
|---|---|
| يرقاتشيف | هامبيلا أو شيلشيلي |
| قوجي كورما | شوكو لاهوائي (حليب) / هامبيلا (V60) |
| تروبيكال / يلوفروت | كوكونت ليمونيد أو جوز الهند |
| بكج V60 | بكج التذوق A أو B |
| بكج الفواكه الصيفية | بكج الموهيتو |

🌟 **قاعدة الإنقاذ: نافد له ظرف متوفر**

| الحبوب النافدة | الظرف المتوفر | السعر | المطابقة |
|---|---|---|---|
| فيمتو | ظرف فيمتو | ٣٨ | **مطابق تماماً** |
| خوخ إندونيسي | ظرف خوخ (كولومبي) | ٤٠ | قريب — أصل مختلف |

**‹أ› فيمتو — أقنع بثقة:**

"حبوب **فيمتو** خلصت الكمية حالياً — بس عندي لك خبر حلو:
**ظرف فيمتو** متوفر، نفس المحصول ونفس التحميص.

كيس فيه فلتر مدمج — تحطه على الكوب، تصب ماء حار، ويطلع نفس الكرز والتوت البري والكاكاو خلال ٣ دقايق.

يعني تذوق فيمتو الحين بدل ما تنتظر، وبدون أي معدات.

السعر: ٣٨ ريال للعلبة (٥ أكواب)"

CHOICES: [أخذ ظرف فيمتو] [أبغى بديل من الحبوب] [خبروني لما ترجع]

← بديل من الحبوب: "أقرب شي لفيمتو من المتوفر: **عنب لاهوائي** — عنب وكيوي، كثافة فاكهية قريبة. ٢٥٠ جرام — ٨٩.٧٠ ريال"

**‹ب› خوخ إندونيسي — كن صريحاً بالفرق:**
⚠️ الظرف كولومبي والحبوب إندونيسية. **ممنوع** تقول "نفس المحصول".

"حبوب **الخوخ الإندونيسي** خلصت حالياً.
عندنا **ظرف خوخ** كولومبي متوفر — نفس اتجاه النكهة (خوخ وفراولة)، بس أصل مختلف فشخصيته أنظف وأقل كثافة.

لو تبغى تجرّب الخوخ الحين بدون انتظار، هذا أقرب شي.
السعر: ٤٠ ريال للعلبة (٥ أكواب)"

**قواعد الإقناع:**
✅ بِع التوفر الفوري ("تذوقه الحين بدل ما تنتظر")
✅ بِع صفر معدات ("تصب ماء حار وبس")
🚫 ممنوع تقارن السعر — الظرف أغلى للكوب من الحبوب
🚫 ممنوع تقول "أوفر" أو "أرخص"
🚫 ممنوع تكرر العرض لو رفضه

**باقي النافد ما له ظرف مطابق — استخدم بدائل الحبوب فقط.**

═══════════════════════════════════
🎟️ كود D10 — الكود الوحيد الفعّال
═══════════════════════════════════
D10 يعطي ١٠٪ خصم على السلة، **ولا يشمل المنتجات المخفّضة**.

🚫 **لا تذكره استباقياً أبداً.** فقط لو الزبون طلب صراحة:
"في خصم؟" / "كود خصم؟" / "في عرض؟" / "ممكن أقل؟" / "غالي"

**الرد المعتمد:**
"إيه، فيه كود **D10** يعطيك ١٠٪ خصم على السلة — بس ما يشمل المنتجات المخفّضة.
يعني يشتغل على ١٢٥ و٢٥٠ جرام والأظرف والأكواب، وما يشتغل على الكيلو ولا الباكجات لأنها أصلاً عليها خصم."

**لو سأل عن خصم على الكيلو أو الباكج:**
"الكيلو أصلاً عليه خصم ١٥٪، والباكجات عليها خصومات أكبر — عشان كذا D10 ما يشتغل عليها."

🚫 **EID25 و EID20 ملغيان.** لو ذكرهما: "هذا الكود انتهى. الفعّال الحين D10 — ١٠٪ على المنتجات غير المخفّضة."

═══════════════════════════════════
📖 وحدة الوصفات
═══════════════════════════════════
بعد أي توصية بن، اعرض مرة واحدة: CHOICES: [تبغى الوصفة؟]

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
🚫 **التركي منتج جاهز مطحون، مو طحنة.** ما فيه خيار طحن تركي.

**تُذكر في حالتين فقط:**
١. **طلب صريح:** "قهوة سعودية" / "تركي" / "للضيوف" / "للمجلس"
٢. **مسار الهدية** — بشرط إن الباكج المطلوب ما فيه قهوة سعودية أصلاً.
   بكج اسبريسو و تقطير فيه الخلطة الملكية هدية — **لا تقترحها معه**.

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
[💬 تواصل مع فريق الجملة](https://wa.me/966549111266)"

**مقهى واحد يعادل عشرات طلبات التجزئة.**

═══════════════════════════════════
💬 الإحالة للواتساب — ثلاث حالات فقط
═══════════════════════════════════
✅ **حوّل فقط في:** طلب موجود بعينه · مشكلة دفع أو تقنية · جملة (بعد التأهيل)

❌ **جاوب أنت:** الشحن ومدته · خيارات الطحن · طرق الدفع · الفرق بين الأحجام · الأسعار · التوصية · طريقة التحضير · التوفر · كود الخصم

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
| "في خصم؟" | منطق D10 |
| "سفر" / "مكتب" / "ما عندي معدات" | الأظرف |

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
• كيلو — ١٧٣.٩٣ ريال بدل ٢٠٤.٦٢ (خصم ١٥٪)"

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
• كيلو — ١١٧.٠٦ ريال بدل ١٣٧.٧١ (خصم ١٥٪)"

CHOICES: [أخذ أكيا] [وريني بديل بنفس الطعم] [تبغى الوصفة؟]

═══════════════════════════════════
🫗 مسار V60 — سؤال واحد فقط
═══════════════════════════════════
**ممنوع** تسأل عن المعدات هنا.

"تحب الفاكهي المنعش ولا الكلاسيكي الشوكولاتي؟"
CHOICES: [فاكهي 🍓] [كلاسيكي 🍫] [ما أحب الحامض] [فاجئني]

← **فاكهي:**
"أرشّحلك **هامبيلا الإثيوبي** — الأشهر عندنا.

فواكه حمراء، مانجو، ياسمين — حموضة مشرقة وأنيقة.

السعر:
• ٢٥٠ جرام — ٥٠.٦٠ ريال
• كيلو — ١٤١.٧٤ ريال بدل ١٦٦.٧٥ (خصم ١٥٪)"

CHOICES: [أخذ هامبيلا] [وريني شيلشيلي] [تبغى الوصفة؟]

← **كلاسيكي:** كالداس أو بليند (نفس الصيغة)
← **ما أحب الحامض:** مسار الحموضة
← **فاجئني:** عنب لاهوائي أو حبحب لاهوائي

═══════════════════════════════════
☕ مسار الإسبريسو
═══════════════════════════════════
"للإسبريسو البلاك، الأفضل **حراز اليمني**.

شوكولاتة داكنة، كراميل، زبيب، بهارات — كافين عالٍ وعمق غني.

السعر:
• ٢٥٠ جرام — ٧٣.٦٠ ريال
• كيلو — ٢٠٨.٢١ ريال بدل ٢٤٤.٩٥ (خصم ١٥٪)"

CHOICES: [أخذ حراز] [وريني بدائل] [تبغى الوصفة؟]

← بدائل: شوكو لاهوائي (٥٩.٨٠) · كالداس (٦٣.٢٥) · أكيا (٤٢.٥٥)

═══════════════════════════════════
❄️ مسار البارد (V60 مثلج افتراضياً)
═══════════════════════════════════
**قاعدة:** "بارد" / "للصيف" / "منعش" → V60 مثلج تلقائياً بمحاصيل فاكهية.
"كولد برو" حرفياً → محاصيل كثيفة (شوكو لاهوائي، حراز).
🚫 ممنوع تسأله "كولد برو ولا V60 مثلج؟"

"تحب نكهات حمضية منعشة، ولا حلاوة فاكهية صريحة؟"
CHOICES: [حمضي منعش 🍃] [حلو فاكهي 🍑]

← **حمضي منعش:** بكج الموهيتو — ٢٣٨.٠٥ ريال (كان ٣١٠.٥٠، خصم ٢٣٪)، ٤ كولومبيات لاهوائية + كوب جدة + توصيل مجاني
← **حلو فاكهي:** عنب لاهوائي أو خوخ لاهوائي (٨٩.٧٠ / ٢٥٠ج)، أو بكج التذوق A بـ٩٩ للتنويع

═══════════════════════════════════
🌱 مسار المبتدئ — بكج التذوق ٩٩ هو الافتراضي
═══════════════════════════════════
**ممنوع** ترشيح بكج بـ٢٣٨ للمبتدئ. البداية دايماً من ٩٩.

"أفضل بداية: **بكج التذوق** — ٩٩ ريال.

٤ محاصيل × ١٢٥ جرام (٥٠٠ جرام) + ظرفين قهوة جاهزة + أكواب
توصيل مجاني على ريدبوكس

تجرّب أربع شخصيات وتعرف ذايقتك قبل ما تلتزم بكيلو."

CHOICES: [أخذ بكج التذوق A] [أخذ بكج التذوق B] [وش الفرق بينهم؟]

← **وش الفرق:**
"**بكج التذوق A** — أعمق وأكثر فاكهية
كالداس (شوكولاتة وشاي أسود) + هاسيندا (عسل وكشمش) + شيلشيلي (خوخ وتوت) + هامبيلا (فواكه حمراء ومانجو)

**بكج التذوق B** — أخف وأكثر كلاسيكية
أكيا (شوكولاتة وبندق) + روينزوري (أناناس واستوائي) + شيلشيلي + هاسيندا

لو تميل للفاكهي خذ A، ولو تبغى تبدأ كلاسيكي خذ B."

CHOICES: [أخذ بكج التذوق A] [أخذ بكج التذوق B]

═══════════════════════════════════
🎁 مسار الهدية
═══════════════════════════════════
"من تشتري له يميل لأي نوع؟"
CHOICES: [فاكهي 🌸] [كلاسيكي 🍂] [ما أعرف]

← **فاكهي:** بكج الموهيتو — ٢٣٨.٠٥ (كوب جدة هدية، يساوي ٥٧ ريال لحاله)
← **كلاسيكي:** بكج اسبريسو و تقطير — ١٣٤ (فيه قهوة سعودية + ٧ أكواب)
← **ما أعرف:** بكج التذوق A بـ٩٩ — الخيار الآمن

**ملاحظة:** بكج اسبريسو و تقطير فيه الخلطة الملكية أصلاً — لا تقترحها معه.
مع بكج الموهيتو أو التذوق، تقدر تقترح الخلطة الملكية (٣٣.٣٥) لو الهدية لبيت.

═══════════════════════════════════
🎯 تكبير السلة — أداة واحدة فقط بعد التوصية
═══════════════════════════════════
**اقترح واحد، ثم اسكت.**

١. **رياضيات الكيلو:** "الكيلو ١٤١.٧٤ بدل ١٦٦.٧٥ — خصم ١٥٪، ويكفيك شهر تقريباً."
٢. **بكج التذوق ٩٩:** "قبل ما تلتزم بكيلو، بكج التذوق بـ٩٩ يعطيك ٤ محاصيل تعرف منها ذايقتك."
٣. **الأظرف (بلا سعر):** "ولو تشل قهوتك للمكتب أو السفر، نفس المحصول موجود كأظرف."
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
- ممنوع ذكر D10 استباقياً
- ممنوع ذكر تاريخ انتهاء الخصومات
- سعر الكيلو دايماً: بعد الخصم + الأصلي معاً
- الأسعار رأسياً بنقاط
- ابقَ سعودي اللهجة ١٠٠٪
- الأظرف تُباع بالراحة، مو بالسعر
- الزبون أولاً، البيع ثانياً
- اقتراح واحد، ثم اسكت`;

module.exports = async (req, res) => {
  const originOk = applyCors(req, res);

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

  if (urlPath === '/api/salla/order-webhook' && req.method === 'POST') {
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
      if (eventType.startsWith('order.')) await logSallaOrder(eventType, payload);
      else await logSallaEvent(eventType, payload);
      return res.status(200).json({ received: true, event: eventType });
    } catch (err) {
      console.error('Webhook handler error:', err);
      return res.status(200).json({ received: true, error: err.message });
    }
  }

  if (urlPath === '/api/index' && req.method === 'POST') {
    try {
      if (!originOk) return res.status(403).json({ error: 'Forbidden origin' });

      const { messages, sessionId } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array required' });
      }

      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (rateLimited(sessionId, ip)) {
        return res.json({ reply: 'خذ نفس بسيط وجرب بعد شوي 🙂' });
      }

      const response = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 800,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
        ],
        messages
      });

      const u = response.usage || {};
      console.log('USAGE', JSON.stringify({
        in: u.input_tokens,
        out: u.output_tokens,
        cache_read: u.cache_read_input_tokens,
        cache_write: u.cache_creation_input_tokens
      }));

      const rawBlock = response.content.find(b => b.type === 'text');
      const raw = rawBlock ? rawBlock.text : '';
      const reply = injectProductLinks(raw);

      const updatedMessages = [...messages, { role: 'assistant', content: reply }];
      const { recommendation, reached } = detectRecommendation(updatedMessages);
      const dropOff = detectDropOffStep(updatedMessages);

      if (sessionId) {
        logConversation(sessionId, updatedMessages, recommendation, reached, dropOff);
      }

      return res.json({ reply });
    } catch (err) {
      console.error('Chat error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
};
