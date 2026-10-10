// Integration harness for api/index.js. Run via tests/integration/run.sh (self-signed cert for the fake Supabase is generated there).
// Local test harness: fake Supabase (HTTPS), fake Anthropic, fake Salla store-info.
const https = require('https'); const fs = require('fs'); const Module = require('module');
const db = { stores: [], conversations: [], orders: [], salla_events: [], session_identities: [], products: [] };
const log = [];
function match(row, q) {
  for (const [k, v] of q) {
    if (['select','order','limit','on_conflict'].includes(k)) continue;
    const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)];
    if (op === 'eq' && String(row[k]) !== val) return false;
    if (op === 'gte' && !(row[k] >= val)) return false;
    if (op === 'lt' && !(row[k] < val)) return false;
    if (op === 'is' && val === 'null' && !(row[k] === null || row[k] === undefined)) return false;
    if (op === 'not' && val === 'is.null' && (row[k] === null || row[k] === undefined)) return false;
  }
  return true;
}
const srv = https.createServer({ key: fs.readFileSync('k.pem'), cert: fs.readFileSync('c.pem') }, (req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const u = new URL(req.url, 'https://x'); const t = u.pathname.replace('/rest/v1/', ''); const q = [...u.searchParams];
    log.push(req.method + ' ' + t);
    if (req.method === 'GET') { res.end(JSON.stringify(db[t].filter(r => match(r, q)).slice(0, Number(u.searchParams.get('limit')) || 999))); return; }
    const body = b ? JSON.parse(b) : null;
    if (req.method === 'POST') {
      const oc = u.searchParams.get('on_conflict');
      for (const item of (Array.isArray(body) ? body : [body])) {
        if (oc) { const keys = oc.split(','); const ex = db[t].find(r => keys.every(k => String(r[k]) === String(item[k]))); if (ex) { Object.assign(ex, item); continue; } }
        db[t].push({ ...item, created_at: new Date().toISOString() });
      }
      res.statusCode = 201; return res.end();
    }
    if (req.method === 'PATCH') { db[t].filter(r => match(r, q)).forEach(r => Object.assign(r, body)); res.statusCode = 204; return res.end(); }
  });
});
// Fake Salla store info
const realReq = https.request;
https.request = function(opts, cb) {
  if (opts.hostname === 'api.salla.dev') {
    const { PassThrough } = require('stream'); const r = new PassThrough(); r.statusCode = 200;
    const body = opts.path.startsWith('/admin/v2/products')
      ? (global.fakeProducts ? global.fakeProducts(opts.path) : { data: [], pagination: { totalPages: 1 } })
      : { data: { id: 999, name: 'Demo', domain: 'https://demostore.salla.sa/dev-abc' } };
    setImmediate(() => { cb(r); r.end(JSON.stringify(body)); });
    return { on() {}, end() {}, write() {} };
  }
  if (opts.hostname === 'accounts.salla.sa') {
    const { PassThrough } = require('stream'); const r = new PassThrough(); r.statusCode = 200;
    let sent = '';
    return { on() {}, write(d) { sent += d; }, end() {
      global.lastRefreshForm = sent;
      const ok = sent.includes('refresh_token=RT_OK');
      setImmediate(() => { cb(r); r.end(JSON.stringify(ok ? { access_token: 'AT_NEW', refresh_token: 'RT_NEW', expires_in: 1209600 } : { error: 'invalid_grant' })); });
    } };
  }
  return realReq.apply(this, arguments);
};
// Fake Anthropic SDK
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(r, ...a) { return r === '@anthropic-ai/sdk' ? '/fake-anthropic' : origResolve.call(this, r, ...a); };
require.cache['/fake-anthropic'] = { id: '/fake-anthropic', filename: '/fake-anthropic', loaded: true,
  exports: class { constructor() { this.messages = { create: async (params) => global.fakeClaude ? global.fakeClaude(params) : ({ usage: {}, content: [{ type: 'text', text: 'هلا! جرب حراز' }] }) }; } } };

function call(handler, method, url, headers, body) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o, headers: this.headers }); },
      send(o) { resolve({ status: this.statusCode, body: o }); }, end() { resolve({ status: this.statusCode, headers: this.headers }); }, redirect() {} };
    handler({ method, url, headers, body }, res);
  });
}
srv.listen(8443, async () => {
  process.env.SUPABASE_URL = 'https://localhost:8443'; process.env.SUPABASE_KEY = 'test';
  process.env.SALLA_WEBHOOK_SECRET = 'publicsecret'; process.env.SALLA_PRIVATE_WEBHOOK_SECRET = 'privatesecret';
  const h = require(process.argv[2]);
  const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };
  const DRIP = { origin: 'https://driponcoffeesa.com' }, DEMO = { origin: 'https://demostore.salla.sa' };
  const msg = [{ role: 'user', content: 'هلا' }];
  let r = await call(h, 'POST', '/api/index', DRIP, { messages: msg, sessionId: 'session_1_abcdefgh' });
  ok('drip on chat 200', r.status === 200 && r.body.reply && r.headers['access-control-allow-origin'] === DRIP.origin);
  ok('drip on conversation store_id=dripon', db.conversations.at(-1)?.store_id === 'dripon');
  r = await call(h, 'POST', '/api/index', { origin: 'https://evil.com' }, { messages: msg, sessionId: 'session_1_x' });
  ok('unknown origin 403', r.status === 403);
  r = await call(h, 'POST', '/api/salla/webhook', {}, { event: 'app.store.authorize', merchant: 999, data: { access_token: 'AT', refresh_token: 'RT', expires: 1800000000, scope: 'x' } });
  ok('webhook without token 401', r.status === 401 && db.stores.length === 0);
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer wrongsecretxx' }, { event: 'app.store.authorize', merchant: 999, data: {} });
  ok('webhook wrong token 401', r.status === 401);
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer privatesecret' }, { event: 'app.store.authorize', merchant: 999, data: { access_token: 'AT', refresh_token: 'RT', expires: 1800000000, scope: 'x' } });
  const st = db.stores.find(s => s.salla_store_id === '999');
  ok('authorize saved store (private, tokens, domain)', r.status === 200 && st && st.salla_app === 'private' && st.access_token === 'AT' && st.store_domain.startsWith('https://demostore'));
  ok('token never in salla_events', !JSON.stringify(db.salla_events).includes('AT'));
  r = await call(h, 'POST', '/api/index', DEMO, { messages: msg, sessionId: 'session_2_demodemo' });
  ok('demo store chat allowed, store_id=999', r.status === 200 && db.conversations.at(-1)?.store_id === '999');
  r = await call(h, 'POST', '/api/identify', DEMO, { sessionId: 'session_2_demodemo', customerId: '55' });
  ok('identify 204 + row', r.status === 204 && db.session_identities.length === 1 && db.session_identities[0].store_id === '999');
  r = await call(h, 'POST', '/api/identify', DEMO, { sessionId: 'bad', customerId: '55' });
  ok('identify rejects bad session id', r.status === 400);
  r = await call(h, 'POST', '/api/identify', { origin: 'https://evil.com' }, { sessionId: 'session_2_demodemo', customerId: '55' });
  ok('identify rejects unknown origin', r.status === 403);
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer privatesecret' }, { event: 'order.created', merchant: 999, data: { id: 7, customer: { id: 55, first_name: 'A' }, total: { amount: 120, currency: 'SAR' }, items: [{ name: 'حراز' }] } });
  const o = db.orders.at(-1);
  ok('order attributed to session', o && o.store_id === '999' && o.session_id === 'session_2_demodemo' && o.attribution_method === 'customer_id');
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer privatesecret' }, { event: 'order.created', merchant: 999, data: { id: 8, customer: { id: 77 } } });
  ok('order with unknown customer not attributed', db.orders.at(-1).session_id === null);
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer privatesecret' }, { event: 'order.created', merchant: 999, data: { id: 9, customer: { id: 88, email: 'x@y.z', mobile: 555, first_name: 'B', birthday: { date: '1990-01-01' } }, items: [{ name: 'حراز', quantity: 2, product: { id: 321 }, amounts: { total: { amount: 147.2 } } }] } });
  const pii = JSON.stringify(db.orders.at(-1));
  ok('order keeps no contact details', !/x@y\.z|555|1990-01-01|"B"/.test(pii) && db.orders.at(-1).customer_id === '88');
  ok('order keeps items for memory', JSON.stringify(db.orders.at(-1).raw_payload.items) === JSON.stringify([{ product_id: '321', sku_id: null, name: 'حراز', quantity: 2, total: 147.2 }]));
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer privatesecret' }, { event: 'order.status.updated', merchant: 999, data: { id: 4242, status: 'مكتمل', order: { id: 9, reference_id: 555, status: { name: 'مكتمل', slug: 'closed' }, customer: { id: 88 }, amounts: { total: { amount: 147.2, currency: 'SAR' } }, items: [{ name: 'حراز', product: { id: 321 } }] } } });
  const su = db.orders.at(-1);
  ok('status update reads the nested order', su.salla_order_id === '9' && su.customer_id === '88' && su.total_amount === 147.2 && su.raw_payload.status_slug === 'closed');
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer publicsecret' }, { event: 'customer.updated', merchant: 999, data: { id: 55, mobile: '0500000000', email: 'a@b.c' } });
  const ev = db.salla_events.at(-1);
  ok('public secret accepted; customer event minimal, no PII', r.status === 200 && ev.raw_payload.entity_id === 55 && !JSON.stringify(ev).includes('0500000000'));
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer privatesecret' }, { event: 'app.uninstalled', merchant: 999, data: {} });
  ok('uninstall deactivates + clears tokens', st.is_active === false && st.access_token === null);
  r = await call(h, 'POST', '/api/index', DEMO, { messages: msg, sessionId: 'session_2_demodemo' });
  ok('demo store blocked after uninstall', r.status === 403);
  r = await call(h, 'POST', '/api/index', DRIP, { messages: msg, sessionId: 'session_1_abcdefgh' });
  ok('drip on still works', r.status === 200);
  // Token refresh
  process.env.SALLA_PRIVATE_CLIENT_ID = 'priv-id'; process.env.SALLA_PRIVATE_CLIENT_SECRET = 'priv-secret';
  process.env.SALLA_CLIENT_ID = 'pub-id'; process.env.SALLA_CLIENT_SECRET = 'pub-secret';
  const soon = new Date(Date.now() + 86400000).toISOString(), old = new Date(Date.now() - 2 * 86400000).toISOString();
  db.stores.length = 0;
  db.stores.push(
    { salla_store_id: 'A', salla_app: 'private', is_active: true, refresh_token: 'RT_OK', expires_at: soon, updated_at: old },
    { salla_store_id: 'B', salla_app: 'private', is_active: true, refresh_token: 'RT_OK', expires_at: new Date(Date.now() + 10 * 86400000).toISOString(), updated_at: old },
    { salla_store_id: 'C', salla_app: 'private', is_active: true, refresh_token: 'RT_OK', expires_at: soon, updated_at: new Date().toISOString() });
  r = await call(h, 'GET', '/api/cron/refresh-tokens', {}, undefined);
  const A = db.stores.find(s => s.salla_store_id === 'A'), B = db.stores.find(s => s.salla_store_id === 'B'), C = db.stores.find(s => s.salla_store_id === 'C');
  ok('refresh: expiring store refreshed with private creds', r.status === 200 && A.access_token === 'AT_NEW' && A.refresh_token === 'RT_NEW' && global.lastRefreshForm.includes('client_id=priv-id'));
  ok('refresh: far-from-expiry store untouched', B.access_token === undefined);
  ok('refresh: recently refreshed store skipped (cooldown)', C.access_token === undefined && r.body.skipped === 1);
  db.stores.push({ salla_store_id: 'D', salla_app: 'public', is_active: true, refresh_token: 'RT_BAD', expires_at: soon, updated_at: old });
  A.updated_at = new Date().toISOString();
  r = await call(h, 'GET', '/api/cron/refresh-tokens', {}, undefined);
  const D = db.stores.find(s => s.salla_store_id === 'D');
  ok('refresh: failure reported 500, store kept, public creds used', r.status === 500 && r.body.failed === 1 && D.refresh_token === 'RT_BAD' && global.lastRefreshForm.includes('client_id=pub-id'));
  // Catalog sync
  db.stores.push({ salla_store_id: 'S1', is_active: true, access_token: 'TOK', salla_app: 'private' });
  db.products.push({ store_id: 'S1', salla_product_id: '77', name: 'old gone', metadata: { notes: 'x' }, synced_at: '2020-01-01T00:00:00Z', removed_at: null });
  db.products.push({ store_id: 'S1', salla_product_id: '1', name: 'old name', metadata: { notes: 'keep me' }, synced_at: '2020-01-01T00:00:00Z', removed_at: null });
  global.fakeProducts = (path) => {
    const page = Number(new URL('http://x' + path).searchParams.get('page'));
    const all = [
      { id: 1, name: 'هاسيندا ٢٥٠ جرام', sku: 'H250', status: 'sale', is_available: true, quantity: 12, price: { amount: 52.9, currency: 'SAR' }, regular_price: { amount: 52.9, currency: 'SAR' }, sale_price: { amount: 0 }, url: 'https://driponcoffeesa.com/p1', main_image: { url: 'img1' }, categories: [{ id: 5, name: 'محاصيل' }], description: '<p>كولومبي <b>كلاسيكي</b></p>' },
      { id: 2, name: 'روينزوري كيلو', status: 'out', is_available: false, unlimited_quantity: false, quantity: 0, price: { amount: 121.21, currency: 'SAR' }, url: 'https://driponcoffeesa.com/p2' }
    ];
    return { data: page === 1 ? [all[0]] : [all[1]], pagination: { totalPages: 2, currentPage: page } };
  };
  r = await call(h, 'GET', '/api/cron/refresh-tokens', {}, undefined);
  const p1 = db.products.find(p => p.store_id === 'S1' && p.salla_product_id === '1');
  const p2 = db.products.find(p => p.store_id === 'S1' && p.salla_product_id === '2');
  const p77 = db.products.find(p => p.store_id === 'S1' && p.salla_product_id === '77');
  ok('sync: paginated, both products stored', p1 && p2 && r.body.sync.find(x => x.storeId === 'S1').count === 2);
  ok('sync: fields mapped (price, stock, url, desc stripped)', p1.price === 52.9 && p1.is_available === true && p1.quantity === 12 && p1.url.endsWith('/p1') && p1.description === 'كولومبي كلاسيكي' && p2.is_available === false);
  ok('sync: metadata enrichment preserved', p1.metadata && p1.metadata.notes === 'keep me' && p1.name === 'هاسيندا ٢٥٠ جرام');
  ok('sync: missing product marked removed, not deleted', p77 && p77.removed_at);
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer privatesecret' }, { event: 'product.price.updated', merchant: 'S1', data: { id: 2, name: 'روينزوري كيلو', status: 'sale', is_available: true, quantity: 5, price: { amount: 99, currency: 'SAR' } } });
  ok('webhook product update upserts live', p2.price === 99 && p2.is_available === true);
  r = await call(h, 'POST', '/api/salla/webhook', { authorization: 'Bearer privatesecret' }, { event: 'product.deleted', merchant: 'S1', data: { id: 1 } });
  ok('webhook product.deleted marks removed', !!p1.removed_at);

  // Tool mode (Block 1)
  process.env.TOOLS_STORES = 'dripon';
  const U = id => 'https://driponcoffeesa.com/ar/product/p' + id;
  db.products.push(
    { store_id: 'dripon', salla_product_id: '10', name: 'أكيا 250', price: 42.55, is_available: true, url: U(10), metadata: { type: 'beans', bean: 'أكيا', size_g: 250, notes: ['شوكولاتة'], milk: true } },
    { store_id: 'dripon', salla_product_id: '11', name: 'أكيا كيلو', price: 137.71, is_available: true, url: U(11), metadata: { type: 'beans', bean: 'أكيا', size_g: 1000, notes: ['شوكولاتة'], milk: true } },
    { store_id: 'dripon', salla_product_id: '12', name: 'كايا 250', price: 62.88, is_available: true, url: U(12), metadata: { type: 'beans', bean: 'كايا', size_g: 250, notes: ['توت مشكل'], milk: false } },
    { store_id: 'dripon', salla_product_id: '13', name: 'فيمتو 250', price: 80, is_available: false, url: U(13), metadata: { type: 'beans', bean: 'فيمتو', size_g: 250, notes: ['كرز'], milk: false } });
  const calls = [];
  global.fakeClaude = async (params) => {
    calls.push(params);
    if (calls.length === 1) return { usage: {}, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'search_products', input: { milk: true } }] };
    return { usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text: `أرشّح [أكيا](${U(10)}) و[كايا](${U(12)}) و[فيمتو](${U(13)}) ومعك [💬 واتساب](https://wa.me/966549111266)` }] };
  };
  r = await call(h, 'POST', '/api/index', DRIP, { messages: [{ role: 'user', content: 'أبغى قهوة للحليب' }], sessionId: 'session_regress_tools1' });
  const toolResult = JSON.parse(calls[1].messages.at(-1).content[0].content);
  ok('tools: search filters milk and groups sizes', toolResult.count === 1 && toolResult.results[0].name === 'أكيا' && toolResult.results[0].sizes.length === 2 && toolResult.results[0].sizes[1].price === 137.71);
  ok('tools: prompt has no hardcoded catalog', !calls[0].system[0].text.includes('١٤٧.٩٥') && calls[0].tools[0].name === 'search_products');
  ok('tools: only looked-up product links survive', r.body.reply.includes(`[أكيا](${U(10)})`) && !r.body.reply.includes(U(12)) && !r.body.reply.includes(U(13)) && r.body.reply.includes('wa.me'));
  calls.length = 0;
  global.fakeClaude = async (params) => { calls.push(params); return { usage: {}, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't' + calls.length, name: 'search_products', input: { query: 'فيمتو', include_unavailable: true } }] }; };
  r = await call(h, 'POST', '/api/index', DRIP, { messages: [{ role: 'user', content: 'فيمتو؟' }], sessionId: 'session_regress_tools2' });
  ok('tools: loop is capped and the last round disables tools', calls.length === 5 && calls[4].tool_choice && calls[4].tool_choice.type === 'none' && r.status === 200);
  ok('tools: unavailable shown only when asked', JSON.parse(calls[1].messages.at(-1).content[0].content).results[0].sizes[0].available === false);
  process.env.TOOLS_STORES = ''; global.fakeClaude = null;
  r = await call(h, 'POST', '/api/index', DRIP, { messages: msg, sessionId: 'session_regress_tools3' });
  ok('tools off: prompt-catalog mode unchanged', r.status === 200 && r.body.reply.includes('حراز'));
  srv.close();
});
