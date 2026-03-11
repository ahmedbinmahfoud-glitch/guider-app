const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// ── تثبيت التطبيق على المتجر
app.post('/auth/callback', async (req, res) => {
  const { code, store_id } = req.body;
  try {
    const response = await axios.post('https://accounts.salla.sa/oauth2/token', {
      client_id: process.env.SALLA_CLIENT_ID,
      client_secret: process.env.SALLA_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code
    });
    const { access_token } = response.data;
    await supabase.from('stores').upsert({
      salla_store_id: store_id,
      access_token,
      is_active: true
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── جلب منتجات المتجر من سلة
async function getStoreProducts(access_token) {
  const response = await axios.get('https://api.salla.dev/admin/v2/products', {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  return response.data.data.map(p => ({
    id: p.id,
    name: p.name,
    price: p.price.amount,
    currency: p.price.currency,
    description: p.description || '',
    category: p.category?.name || '',
    url: p.url
  }));
}

// ── الـ Widget API — يسأل الـ AI ويرد
app.post('/api/chat', async (req, res) => {
  const { store_id, messages, products } = req.body;

  const productList = products.map(p =>
    `- ${p.name} | السعر: ${p.price} ${p.currency} | الفئة: ${p.category}`
  ).join('\n');

  const systemPrompt = `أنت بائع ذكي ومحترف في متجر إلكتروني سعودي.
مهمتك: تساعد الزبون يلقى المنتج المناسب بالضبط.

منتجات المتجر:
${productList}

قواعدك:
- اسأل سؤال واحد فقط في كل مرة
- أسئلتك قصيرة وودية بالعربي
- بعد سؤالين أو ثلاثة، أوصِ بمنتج محدد من القائمة
- اذكر اسم المنتج وسعره وليش هو مناسب للزبون
- لا توصي بمنتج مو موجود في القائمة`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages
  });

  res.json({ reply: response.content[0].text });
});

// ── جلب منتجات المتجر للـ Widget
app.get('/api/products/:store_id', async (req, res) => {
  try {
    const { data: store } = await supabase
      .from('stores')
      .select('access_token')
      .eq('salla_store_id', req.params.store_id)
      .single();

    if (!store) return res.status(404).json({ error: 'Store not found' });

    const products = await getStoreProducts(store.access_token);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── تسجيل إحصائية
app.post('/api/stats', async (req, res) => {
  const { store_id, type } = req.body;
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('salla_store_id', store_id)
    .single();

  if (!store) return res.status(404).json({ error: 'Store not found' });

  const field = type === 'visit' ? 'visitor_count' :
                type === 'complete' ? 'completion_count' : 'conversion_count';

  await supabase.rpc('increment_stat', { store_uuid: store.id, stat_field: field });
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Guider running on port ${PORT}`));
