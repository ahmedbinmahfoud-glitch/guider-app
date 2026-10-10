// Block 1 catalog tools: the bot reads prices, stock and product knowledge
// from the synced `products` table instead of the hardcoded prompt catalog.
// Enabled per store (see toolsEnabled in api/index.js).

const TYPES = ['beans', 'drip_bag', 'package', 'saudi_coffee', 'turkish_coffee', 'tool'];

const TOOLS = [
  {
    name: 'search_products',
    description: 'يبحث في منتجات المتجر الحالية ويرجع السعر الحالي (شامل الضريبة) والتوفر والرابط ومعلومات الطعم. استخدمه قبل أي توصية أو ذكر سعر أو توفر. كل الحقول اختيارية؛ اتركها فاضية لعرض كل المتوفر من النوع.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'كلمات للبحث في الاسم والنكهات والمنشأ، مثل: هامبيلا، توت، إثيوبيا، شوكولاتة' },
        type: { type: 'string', enum: TYPES, description: 'beans حبوب، drip_bag أظرف، package باكجات، saudi_coffee قهوة سعودية، turkish_coffee قهوة تركية، tool أدوات وأكواب' },
        milk: { type: 'boolean', description: 'true = المناسب مع الحليب فقط' },
        brew: { type: 'string', description: 'طريقة التحضير: V60 أو اسبريسو أو حليب أو فرنش برس' },
        acidity: { type: 'string', enum: ['منخفضة', 'متوسطة', 'مرتفعة'] },
        max_price: { type: 'number', description: 'أعلى سعر بالريال لحجم واحد' },
        size_g: { type: 'integer', enum: [125, 250, 1000] },
        include_unavailable: { type: 'boolean', description: 'true لعرض غير المتوفر أيضاً (مثلاً لو الزبون سأل عن منتج بالاسم)' }
      },
      additionalProperties: false
    }
  }
];

// Arabic normalisation for matching: alef forms, taa marbuta, alef maqsura,
// diacritics, tatweel, and "لا هوائي" vs "لاهوائي".
function norm(s) {
  return String(s || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/لا\s+هوائي/g, 'لاهوائي')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function createCatalog(sb) {
  const cache = new Map(); // storeId -> { at, rows }
  async function load(storeId) {
    const hit = cache.get(storeId);
    if (hit && Date.now() - hit.at < 60 * 1000) return hit.rows;
    const r = await sb('GET', `/products?select=salla_product_id,name,price,is_available,quantity,url,metadata` +
      `&store_id=eq.${encodeURIComponent(storeId)}&removed_at=is.null&limit=20000`);
    if (!r.ok || !Array.isArray(r.data)) {
      console.error('catalog load failed:', r.status);
      return hit ? hit.rows : [];
    }
    cache.set(storeId, { at: Date.now(), rows: r.data });
    return r.data;
  }

  function haystack(p) {
    const m = p.metadata || {};
    return norm([p.name, m.bean, m.display, m.origin, m.process, m.style, m.kind, m.contents,
      ...(m.notes || []), ...(m.brew || [])].join(' '));
  }

  async function search(storeId, input, preset) {
    const q = input || {};
    const rows = preset || await load(storeId);
    const tokens = norm(q.query).split(' ').filter(t => t.length > 1);
    let list = rows.filter(p => {
      const m = p.metadata || {};
      if (!q.include_unavailable && p.is_available === false) return false;
      if (q.type && m.type !== q.type) return false;
      if (q.milk === true && m.milk !== true) return false;
      if (q.brew && !(m.brew || []).some(b => norm(b) === norm(q.brew))) return false;
      if (q.acidity && m.acidity !== q.acidity) return false;
      if (q.size_g && m.size_g !== q.size_g) return false;
      if (q.max_price && !(Number(p.price) <= q.max_price)) return false;
      return true;
    });
    if (tokens.length) {
      list = list.map(p => {
        const h = haystack(p);
        return { p, score: tokens.filter(t => h.includes(t)).length };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.p);
    }

    // Beans: one entry per bean with its sizes, so the model sees the price
    // ladder and the per-size link. Everything else: one entry per product.
    const groups = new Map();
    const others = [];
    for (const p of list) {
      const m = p.metadata || {};
      const size = { size_g: m.size_g || null, price: Number(p.price), available: p.is_available !== false, url: p.url };
      if (m.type === 'beans' && m.bean) {
        if (!groups.has(m.bean)) {
          const { type, size_g, bean, display, ...info } = m;
          groups.set(m.bean, { name: m.bean, type: 'beans', ...info, sizes: [] });
        }
        groups.get(m.bean).sizes.push(size);
      } else {
        const { type, display, ...info } = m;
        others.push({ name: m.display || (m.bean && type === 'drip_bag' ? `ظرف ${m.bean}` : p.name), type: m.type || null,
          price: size.price, available: size.available, url: p.url, ...info });
      }
    }
    for (const g of groups.values()) g.sizes.sort((a, b) => (a.size_g || 0) - (b.size_g || 0));
    const results = [...groups.values(), ...others].slice(0, 12);
    return { count: results.length, results };
  }

  // Products named in the given text (bean names for coffee, product names
  // otherwise), longest name first so "حراز لاهوائي" wins over "حراز".
  async function mentioned(storeId, text) {
    const t = norm(text);
    if (!t) return [];
    const rows = await load(storeId);
    const names = new Map();
    for (const p of rows) {
      const m = p.metadata || {};
      const label = m.type === 'beans' && m.bean ? m.bean : (m.display || null);
      if (!label) continue;
      const key = norm(label).replace(/ لاهوائي$/, '');
      if (key.length > 2) names.set(key, label);
    }
    const hits = [];
    let rest = t;
    for (const key of [...names.keys()].sort((a, b) => b.length - a.length)) {
      if (rest.includes(key)) { hits.push(names.get(key)); rest = rest.split(key).join(' '); }
    }
    return hits.slice(0, 4);
  }

  // Full records for named products, available or not.
  async function lookup(storeId, labels) {
    const want = new Set(labels.map(norm));
    const rows = (await load(storeId)).filter(p => {
      const m = p.metadata || {};
      return want.has(norm(m.type === 'beans' && m.bean ? m.bean : m.display));
    });
    const out = await search(storeId, { include_unavailable: true }, rows);
    return out;
  }

  async function run(storeId, name, input) {
    if (name === 'search_products') return search(storeId, input);
    return { error: `unknown tool ${name}` };
  }

  return { TOOLS, run, search, load, mentioned, lookup };
}

// Collects every product URL a tool result returned, so the reply may only
// link to products the model actually looked up.
function collectUrls(result, into) {
  if (!result || typeof result !== 'object') return;
  if (Array.isArray(result)) { result.forEach(x => collectUrls(x, into)); return; }
  for (const [k, v] of Object.entries(result)) {
    if (k === 'url' && typeof v === 'string') into.add(v);
    else if (v && typeof v === 'object') collectUrls(v, into);
  }
}

// Keeps wa.me / mailto links and links to looked-up products; any other
// link is reduced to its text.
function keepAllowedLinks(text, allowed) {
  if (typeof text !== 'string') return text;
  return text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, url) =>
    (/^(https:\/\/wa\.me\/|mailto:)/.test(url) || (allowed && allowed.has(url))) ? all : label);
}

module.exports = { createCatalog, collectUrls, keepAllowedLinks, norm, TOOLS };
