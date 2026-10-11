// Block 3 — customer memory. For a logged-in shopper (identified through
// /api/identify), summarise their past orders at this store so the bot can
// greet a returning customer, build on their taste and suggest a reorder.
// Source: the `orders` table (Salla order webhooks). Only purchase behaviour
// is used; no contact details are stored or shown.

const DROPPED = new Set(['canceled', 'cancelled', 'refunded', 'restored', 'deleted']);
const DAY = 86400000;

function createMemory(sb) {
  async function customerFor(storeId, sessionId) {
    if (!sessionId) return null;
    const r = await sb('GET', `/session_identities?select=customer_id,last_seen` +
      `&store_id=eq.${encodeURIComponent(storeId)}&session_id=eq.${encodeURIComponent(sessionId)}` +
      `&order=last_seen.desc&limit=1`);
    return r.ok && Array.isArray(r.data) && r.data[0] ? String(r.data[0].customer_id) : null;
  }

  async function ordersFor(storeId, customerId) {
    const r = await sb('GET', `/orders?select=salla_order_id,event_type,total_amount,order_status,raw_payload,created_at` +
      `&store_id=eq.${encodeURIComponent(storeId)}&customer_id=eq.${encodeURIComponent(customerId)}` +
      `&order=created_at.asc&limit=500`);
    return r.ok && Array.isArray(r.data) ? r.data : [];
  }

  // One entry per order (latest event wins for status), cancelled/refunded
  // orders dropped, items aggregated per product.
  function summarise(rows, now = Date.now()) {
    const byOrder = new Map();
    for (const row of rows) {
      const prev = byOrder.get(row.salla_order_id) || {};
      const raw = row.raw_payload || {};
      byOrder.set(row.salla_order_id, {
        id: row.salla_order_id,
        at: prev.at || raw.order_date || row.created_at,
        total: Number(row.total_amount) || prev.total || 0,
        items: (raw.items && raw.items.length ? raw.items : prev.items) || [],
        status: raw.status_slug || prev.status || null
      });
    }
    const orders = [...byOrder.values()].filter(o => !DROPPED.has(o.status));
    if (!orders.length) return null;
    const products = new Map();
    for (const o of orders) {
      for (const it of o.items) {
        const key = it.product_id || it.name;
        if (!key) continue;
        const p = products.get(key) || { name: it.name, product_id: it.product_id || null, times: 0, quantity: 0, last: null };
        p.times += 1;
        p.quantity += Number(it.quantity) || 1;
        if (!p.last || new Date(o.at) > new Date(p.last)) p.last = o.at;
        products.set(key, p);
      }
    }
    const last = orders.reduce((a, o) => (new Date(o.at) > new Date(a) ? o.at : a), orders[0].at);
    return {
      order_count: orders.length,
      days_since_last_order: Math.max(0, Math.round((now - new Date(last).getTime()) / DAY)),
      products: [...products.values()]
        .sort((a, b) => b.times - a.times || new Date(b.last) - new Date(a.last))
        .slice(0, 8)
        .map(p => ({ name: p.name, times: p.times, quantity: p.quantity,
          days_ago: Math.max(0, Math.round((now - new Date(p.last).getTime()) / DAY)) }))
    };
  }

  // Returns { customerId, summary, prompt } or null when the shopper is not
  // logged in. A logged-in shopper without orders gets a short "new customer"
  // note so the bot doesn't treat them as returning.
  async function forSession(storeId, sessionId) {
    const customerId = await customerFor(storeId, sessionId);
    if (!customerId) return null;
    const summary = summarise(await ordersFor(storeId, customerId));
    return { customerId, summary, prompt: memoryPrompt(summary) };
  }

  return { forSession, summarise, customerFor };
}

function memoryPrompt(s) {
  if (!s) {
    return `🧠 الزبون الحالي: مسجّل دخول، وما عنده طلبات سابقة عندنا. عامله كزبون جديد.`;
  }
  const lines = s.products.map(p =>
    `- ${p.name} — اشتراه ${p.times === 1 ? 'مرة' : `${p.times} مرات`}، آخر مرة قبل ${p.days_ago} يوم`).join('\n');
  return `🧠 الزبون الحالي: زبون راجع — ${s.order_count === 1 ? 'طلب واحد سابق' : `${s.order_count} طلبات سابقة`}، آخر طلب قبل ${s.days_since_last_order} يوم.
مشترياته السابقة:
${lines || '- (بدون تفاصيل منتجات)'}

كيف تستخدمها:
- رحّب بعودته بجملة قصيرة طبيعية في أول رد فقط (مثل: "هلا والله، نورتنا من جديد")، بدون ما تسرد سجله.
- ابنِ توصياتك على ذوقه من مشترياته. لو طلب نفس النوع، رشّح المحصول اللي اشتراه أو أقرب بديل له.
- لو مر وقت طويل على آخر شراء لمنتج يتكرر استهلاكه، اقترح إعادة طلبه مرة وحدة، بعد ما تتأكد من توفره وسعره بالأداة.
- **كن ضمني:** لا تذكر عدد مرات الشراء ولا التواريخ ولا إنك تشوف سجل طلباته. قل مثلاً "ترجع لشوكو لاهوائي؟" بدل "اشتريته مرتين". لو سأل الزبون نفسه عن طلباته السابقة، جاوبه.
- لا تذكر أي بيانات شخصية.`;
}

module.exports = { createMemory, memoryPrompt };
