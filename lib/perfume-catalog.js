// Perfume catalog tools (stores with rules.vertical = 'perfume'). Same
// interface as lib/catalog.js: { TOOLS, run, search, load, mentioned, lookup }.
// Reads products.metadata written by lib/perfume-enrich.js: line, brand_en,
// gender, concentration, size_ml, tester, families, notes {top,heart,base}.

const { norm, collectUrls } = require('./catalog');
const { FAMILIES } = require('./perfume-enrich');

const TOOLS = [
  {
    name: 'search_products',
    description: 'يبحث في عطور المتجر ويرجع السعر الحالي (شامل الضريبة) والتوفر والرابط والنوتات لكل حجم. استخدمه قبل أي توصية أو ذكر سعر أو توفر. للعطور الشبيهة بعطر يحبه الزبون: مرّر نوتاته وعائلته في similar_notes و families. كل الحقول اختيارية.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'اسم عطر أو ماركة أو كلمات (عربي أو إنجليزي)، مثل: بلو دو شانيل، Dior، عود' },
        brand: { type: 'string', description: 'الماركة بالعربي أو الإنجليزي' },
        gender: { type: 'string', enum: ['men', 'women', 'unisex'] },
        families: { type: 'array', items: { type: 'string', enum: FAMILIES }, description: 'عائلات عطرية مطلوبة (يكفي تطابق وحدة)' },
        similar_notes: { type: 'array', items: { type: 'string' }, description: 'نوتات عطر مرجعي (مثل عطر يحبه الزبون)؛ النتائج ترتّب حسب التشابه' },
        concentration: { type: 'string', enum: ['Extrait', 'Parfum', 'EDP', 'EDT', 'EDC'] },
        season: { type: 'string', enum: ['صيف', 'شتاء', 'ربيع', 'خريف'] },
        occasion: { type: 'string', enum: ['يومي', 'عمل', 'سهرة', 'مناسبات', 'رياضي'] },
        min_price: { type: 'number' },
        max_price: { type: 'number', description: 'أعلى سعر بالريال' },
        exclude_testers: { type: 'boolean', description: 'true لاستبعاد التسترات' },
        include_unavailable: { type: 'boolean', description: 'true لعرض غير المتوفر (لو الزبون سأل عن عطر بالاسم)' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'request_perfume',
    description: 'خدمة طلب عطر غير متوفر في المتجر: استخدمها فقط بعد ما يتأكد البحث إن العطر مو موجود أو غير متوفر، والزبون يبغاه. يسجّل اسم العطر ويرجع رابط واتساب جاهز يرسله الزبون للفريق.',
    input_schema: {
      type: 'object',
      properties: {
        perfume: { type: 'string', description: 'اسم العطر كما طلبه الزبون' },
        brand: { type: 'string' },
        concentration: { type: 'string' },
        size_ml: { type: 'number' },
        budget: { type: 'string', description: 'الميزانية لو ذكرها' }
      },
      required: ['perfume'],
      additionalProperties: false
    }
  }
];

const CONC_AR = { Extrait: 'إكستريه', Parfum: 'بارفان', EDP: 'أو دو بارفان', EDT: 'أو دو تواليت', EDC: 'أو دو كولون', other: '' };

function createPerfumeCatalog(sb, { requestWhatsapp } = {}) {
  const cache = new Map();
  async function load(storeId) {
    const hit = cache.get(storeId);
    if (hit && Date.now() - hit.at < 60 * 1000) return hit.rows;
    const r = await sb('GET', `/products?select=salla_product_id,name,brand,price,is_available,url,metadata` +
      `&store_id=eq.${encodeURIComponent(storeId)}&removed_at=is.null&metadata->>vertical=eq.perfume&limit=20000`);
    if (!r.ok || !Array.isArray(r.data)) { console.error('perfume catalog load failed:', r.status); return hit ? hit.rows : []; }
    cache.set(storeId, { at: Date.now(), rows: r.data });
    return r.data;
  }

  const notesOf = m => [...((m.notes || {}).top || []), ...((m.notes || {}).heart || []), ...((m.notes || {}).base || [])];
  function haystack(p) {
    const m = p.metadata || {};
    return norm([p.name, p.brand, m.line, m.line_en, m.brand_en, ...(m.families || []), ...notesOf(m)].join(' '));
  }
  // Token overlap between two note lists ("الورد البلغاري" matches "ورد").
  function noteScore(m, wanted) {
    const mine = norm([...notesOf(m), ...(m.families || [])].join(' '));
    return wanted.reduce((s, w) => s + (norm(w).split(' ').some(t => t.length > 2 && mine.includes(t)) ? 1 : 0), 0);
  }

  async function search(storeId, input, preset) {
    const q = input || {};
    const rows = preset || await load(storeId);
    const brand = norm(q.brand);
    let list = rows.filter(p => {
      const m = p.metadata || {};
      if (!q.include_unavailable && p.is_available === false) return false;
      if (m.kind && m.kind !== 'perfume' && !q.query) return false;
      if (q.gender && m.gender !== q.gender && !(q.gender !== 'unisex' && m.gender === 'unisex')) return false;
      if (q.concentration && m.concentration !== q.concentration) return false;
      if (q.exclude_testers && m.tester) return false;
      if (q.season && !(m.seasons || []).some(s => s === q.season || s === 'كل المواسم')) return false;
      if (q.occasion && !(m.occasions || []).includes(q.occasion)) return false;
      if (q.families && q.families.length && !(m.families || []).some(f => q.families.includes(f))) return false;
      if (q.max_price && !(Number(p.price) <= q.max_price)) return false;
      if (q.min_price && !(Number(p.price) >= q.min_price)) return false;
      if (brand && !norm([p.brand, m.brand_en].join(' ')).includes(brand)) return false;
      return true;
    });
    const tokens = norm(q.query).split(' ').filter(t => t.length > 1);
    const scored = list.map(p => {
      const h = haystack(p);
      const text = tokens.length ? tokens.filter(t => h.includes(t)).length : 0;
      const sim = q.similar_notes && q.similar_notes.length ? noteScore(p.metadata || {}, q.similar_notes) : 0;
      return { p, text, sim };
    }).filter(x => (!tokens.length || x.text > 0) && (!(q.similar_notes && q.similar_notes.length) || x.sim > 0));
    scored.sort((a, b) => (b.text - a.text) || (b.sim - a.sim));

    // One entry per perfume (brand + line + concentration) with its sizes.
    const groups = new Map();
    for (const { p, sim } of scored) {
      const m = p.metadata || {};
      const key = norm([m.brand_en || p.brand, m.line_en || m.line || p.name, m.concentration].join('|'));
      if (!groups.has(key)) {
        if (groups.size >= 8) continue;
        groups.set(key, {
          name: [m.line || p.name, CONC_AR[m.concentration] || ''].join(' ').trim(), name_en: m.line_en || null,
          brand: p.brand, gender: m.gender, concentration: m.concentration, families: m.families || [],
          notes: { top: ((m.notes || {}).top || []).slice(0, 4), heart: ((m.notes || {}).heart || []).slice(0, 4), base: ((m.notes || {}).base || []).slice(0, 4) },
          seasons: m.seasons || [], occasions: m.occasions || [],
          ...(q.similar_notes && q.similar_notes.length ? { shared_notes: sim } : {}),
          sizes: []
        });
      }
      groups.get(key).sizes.push({ size_ml: m.size_ml || null, tester: !!m.tester, price: Number(p.price), available: p.is_available !== false, url: p.url });
    }
    for (const g of groups.values()) g.sizes.sort((a, b) => (a.size_ml || 0) - (b.size_ml || 0));
    const results = [...groups.values()];
    return { count: results.length, results };
  }

  // Perfume names (Arabic or English line names, 4+ letters) found in text.
  async function mentioned(storeId, text) {
    const t = norm(text);
    if (!t) return [];
    const names = new Map();
    for (const p of await load(storeId)) {
      const m = p.metadata || {};
      for (const label of [m.line, m.line_en]) {
        const k = norm(label);
        if (k.length >= 4) names.set(k, m.line || label);
      }
    }
    const hits = [];
    let rest = ` ${t} `;
    for (const key of [...names.keys()].sort((a, b) => b.length - a.length)) {
      if (rest.includes(` ${key} `) || rest.includes(` ${key}`)) {
        if (!hits.includes(names.get(key))) hits.push(names.get(key));
        rest = rest.split(key).join(' ');
      }
      if (hits.length >= 3) break;
    }
    return hits;
  }

  async function lookup(storeId, labels) {
    const want = new Set(labels.map(norm));
    const rows = (await load(storeId)).filter(p => want.has(norm((p.metadata || {}).line)));
    return search(storeId, { include_unavailable: true }, rows);
  }

  async function requestPerfume(storeId, input, ctx = {}) {
    const q = input || {};
    const clean = v => (v == null ? null : String(v).slice(0, 80));
    const rec = { perfume: clean(q.perfume), brand: clean(q.brand), concentration: clean(q.concentration),
      size_ml: Number(q.size_ml) || null, budget: clean(q.budget), session_id: ctx.sessionId || null };
    if (!rec.perfume) return { error: 'perfume name required' };
    await sb('POST', '/salla_events', { store_id: storeId, event_type: 'widget.perfume_request', raw_payload: rec }, 'return=minimal')
      .catch(() => {});
    const number = ctx.requestWhatsapp || requestWhatsapp;
    if (!number) return { ok: true, note: 'سجلنا الطلب. وجّه الزبون لخدمة العملاء.' };
    const text = ['طلب عطر غير متوفر:', rec.perfume, rec.brand && `الماركة: ${rec.brand}`, rec.concentration && `التركيز: ${rec.concentration}`,
      rec.size_ml && `الحجم: ${rec.size_ml} مل`, rec.budget && `الميزانية: ${rec.budget}`].filter(Boolean).join('\n');
    const url = `${number}?text=${encodeURIComponent(text)}`;
    return { ok: true, whatsapp_url: url, reply_with_link: `[💬 أرسل طلبك للفريق على واتساب](${url})`,
      terms: 'نرد خلال ٤٨ ساعة: نوفّر العطر ونضيفه للمتجر ونرسل لك رابط الشراء. بدون عربون.' };
  }

  async function run(storeId, name, input, ctx) {
    if (name === 'search_products') return search(storeId, input);
    if (name === 'request_perfume') return requestPerfume(storeId, input, ctx);
    return { error: `unknown tool ${name}` };
  }

  return { TOOLS, run, search, load, mentioned, lookup, requestPerfume };
}

module.exports = { createPerfumeCatalog, collectUrls };
