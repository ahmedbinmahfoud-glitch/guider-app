// Perfume catalog enrichment: turns a product's name, brand, categories and
// the merchant's own description into structured metadata (notes, families,
// gender, concentration, size) that the perfume search tool filters on.
// Notes come from the description; general knowledge is only used for
// well-known perfumes and is flagged in `source`, so nothing is invented
// silently. Merged into products.metadata, which catalog sync never overwrites.

const FAMILIES = ['شرقي', 'خشبي', 'زهري', 'فواكه', 'حمضيات', 'أروماتك', 'فوجير', 'جلدي', 'عنبري', 'عودي', 'مسكي', 'بودري', 'حلو', 'منعش', 'توابل', 'أخضر', 'شيبر', 'مائي'];

const EXTRACT_TOOL = {
  name: 'save_perfume',
  description: 'Save the structured data for one perfume product.',
  input_schema: {
    type: 'object',
    properties: {
      line: { type: 'string', description: 'Arabic perfume name only, without brand, concentration, size or "tester" (e.g. "بلو دو شانيل")' },
      line_en: { type: 'string', description: 'English perfume name only (e.g. "Bleu de Chanel")' },
      brand_en: { type: 'string' },
      kind: { type: 'string', enum: ['perfume', 'body_mist', 'hair_mist', 'gift_set', 'deodorant', 'other'] },
      gender: { type: 'string', enum: ['men', 'women', 'unisex'] },
      concentration: { type: 'string', enum: ['Extrait', 'Parfum', 'EDP', 'EDT', 'EDC', 'other'] },
      size_ml: { type: ['number', 'null'] },
      tester: { type: 'boolean', description: 'true if the name says tester / تستر / بدون كرتون' },
      families: { type: 'array', items: { type: 'string', enum: FAMILIES }, maxItems: 4 },
      notes: {
        type: 'object',
        properties: {
          top: { type: 'array', items: { type: 'string' }, maxItems: 6 },
          heart: { type: 'array', items: { type: 'string' }, maxItems: 6 },
          base: { type: 'array', items: { type: 'string' }, maxItems: 6 }
        },
        required: ['top', 'heart', 'base']
      },
      seasons: { type: 'array', items: { type: 'string', enum: ['صيف', 'شتاء', 'ربيع', 'خريف', 'كل المواسم'] } },
      occasions: { type: 'array', items: { type: 'string', enum: ['يومي', 'عمل', 'سهرة', 'مناسبات', 'رياضي'] } },
      longevity: { type: ['string', 'null'], description: 'only if the description states it' },
      source: { type: 'string', enum: ['description', 'description+knowledge', 'none'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
    },
    required: ['line', 'kind', 'gender', 'concentration', 'tester', 'families', 'notes', 'source', 'confidence'],
    additionalProperties: false
  }
};

const SYSTEM = `أنت خبير عطور تستخرج بيانات منظمة من وصف منتج في متجر عطور سعودي.
- النوتات (top/heart/base) بالعربي كما وردت في الوصف. "يفتتح/الافتتاحية" = top، "القلب" = heart، "القاعدة/يستقر" = base.
- لو الوصف ما فيه نوتات واضحة: استخدم معرفتك فقط إذا كان العطر مشهور وتعرف نوتاته بثقة، واكتب source = description+knowledge. وإلا اترك النوتات فاضية واكتب source = none.
- الجنس من تصنيف المنتج أولاً (رجالي/نسائي/للجنسين).
- التركيز: "أو دو بيرفيوم/بارفان" = EDP، "أو دو تواليت" = EDT، "بيور بيرفيوم/بارفان/Parfum" = Parfum، "إكستريه/Extrait" = Extrait.
- لا تخترع الثبات؛ اكتبه فقط إذا ذكره الوصف.
- confidence = low لو الاسم أو الوصف ناقص أو متناقض.`;

function createEnricher(sb, anthropic, model) {
  async function enrichOne(p) {
    const res = await anthropic.messages.create({
      model, max_tokens: 1000, system: SYSTEM,
      tools: [EXTRACT_TOOL], tool_choice: { type: 'tool', name: 'save_perfume' },
      messages: [{ role: 'user', content: `الاسم: ${p.name}\nالماركة: ${p.brand || ''}\nالتصنيفات: ${(p.categories || []).join('، ')}\nالوصف: ${(p.description || '').slice(0, 3000)}` }]
    });
    const block = (res.content || []).find(b => b.type === 'tool_use');
    if (!block) throw new Error('no tool output');
    return { vertical: 'perfume', ...block.input, enriched_at: new Date().toISOString() };
  }

  // Enriches up to `limit` products of a store that have no perfume metadata
  // yet (available ones first). Returns counts; safe to call repeatedly.
  async function enrichBatch(storeId, limit = 8, onlyAvailable = true) {
    const r = await sb('GET', `/products?select=salla_product_id,name,brand,categories,description,metadata` +
      `&store_id=eq.${encodeURIComponent(storeId)}&removed_at=is.null&metadata->>vertical=is.null` +
      (onlyAvailable ? '&is_available=eq.true' : '') + `&limit=${limit}`);
    if (!r.ok || !Array.isArray(r.data)) return { ok: false, status: r.status };
    const results = await Promise.all(r.data.map(async p => {
      try {
        const meta = await enrichOne(p);
        const u = await sb('PATCH', `/products?store_id=eq.${encodeURIComponent(storeId)}&salla_product_id=eq.${encodeURIComponent(p.salla_product_id)}`,
          { metadata: { ...(p.metadata || {}), ...meta } });
        return u.ok;
      } catch (err) {
        console.error('enrich failed', p.salla_product_id, err.message);
        return false;
      }
    }));
    return { ok: true, picked: r.data.length, enriched: results.filter(Boolean).length };
  }

  return { enrichBatch, enrichOne };
}

module.exports = { createEnricher, FAMILIES };
