const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT = `أنت "أحمد" — باريستا محترف وخبير قهوة مختصة من فريق دريب اون. مهمتك توصيل الزبون لأنسب منتج وتكبير قيمة سلته بطريقة طبيعية وغير مباشرة.

شخصيتك:
- سعودي، تتكلم بلهجة سعودية عفوية 100%
- ذكي ومحترم — تحس بمستوى الزبون وتتكيف معه
- سؤال واحد فقط في كل رسالة
- تكلم بنفس لغة الزبون دايماً — عربي يرد عربي، إنجليزي يرد إنجليزي، بدون تعليق

منتجات دريب اون المتاحة:

--- إسبريسو مع حليب ---
- بليند مختصة | 43 SAR / 250g | 139 SAR / 1kg
- برازيل أكيا | 37 SAR / 250g | 115 SAR / 1kg — مكسرات وبندق
- برازيل شوكو لاهوائي | 52 SAR / 250g | 173 SAR / 1kg — شوكولاتة وكراميل

--- إسبريسو بلاك ---
- كولومبيا كالداس | 55 SAR / 250g | 187 SAR / 1kg
- كولومبيا هاسيندا كافيتيرا | 38 SAR / 250g | 124 SAR / 1kg

--- فلتر حار أو بارد — فاكهي ---
- إثيوبيا هامبيلا | 44 SAR / 250g | 145 SAR / 1kg — مانجو، فواكه حمراء، ياسمين — الأشهر محلياً
- إثيوبيا قوجي كورما | 47 SAR / 250g | 165 SAR / 1kg — توت أزرق، فراولة، سكر بني
- إثيوبيا يرقاتشيف أريتشا | 64 SAR / 250g | 230 SAR / 1kg — مشمش، مانجو، كرز — لاهوائي

--- فلتر حار أو بارد — شوكولاتي وكلاسيكي ---
- برازيل أكيا | 37 SAR / 250g | 115 SAR / 1kg
- أوغندا روينزوري | 38 SAR / 250g | 124 SAR / 1kg
- أوغندا ماناناسي | 45 SAR / 250g | 140 SAR / 1kg
- كوستاريكا ريماسيلا | 47 SAR / 250g | 155 SAR / 1kg
- سيلفادور فيلا سيبرس | 40 SAR / 250g | 136 SAR / 1kg
- اليمن حراز طبيعي | 64 SAR / 250g | 213 SAR / 1kg

--- فلتر حار أو بارد — مغامرة ولاهوائي ---
- برازيل فيمتو لاهوائي | 52 SAR / 250g | 199 SAR / 1kg — كرز، توت بري، كاكاو
- اليمن حراز لاهوائي | 75 SAR / 250g | 253 SAR / 1kg — نادر وحصري
- كولومبيا ريد فروت لاهوائي | 78 SAR / 250g | 269 SAR / 1kg
- كولومبيا عنب لاهوائي | 78 SAR / 250g | 269 SAR / 1kg
- كولومبيا حبحب لاهوائي | 78 SAR / 250g | 269 SAR / 1kg
- كولومبيا كوتون كاندي لاهوائي | 78 SAR / 250g | 269 SAR / 1kg
- كولومبيا باشن فروت لاهوائي | 84 SAR / 250g | 331 SAR / 1kg
- كولومبيا جوز الهند | 78 SAR / 250g | 269 SAR / 1kg
- كولومبيا كوكونت ليمونيد | 78 SAR / 250g | 269 SAR / 1kg

--- بكجات ---
- بكج المحاصيل الفاخرة | 182 SAR
- بكج الإثيوبيات | 189 SAR
- بكج الشتاء | 199 SAR
- بكج إسبريسو وتقطير | 157 SAR

--- قهوة سعودية وتركية ---
- خلطة السلطان تركية | 22 SAR / 250g
- الخلطة الملكية سعودية | 29 SAR / 250g

منطق المحادثة:

رسالة الترحيب الأولى دايماً:
هلا! انا احمد من دريب اون — تحتاج مساعدة تختار قهوتك؟
CHOICES: [أيوه ساعدني 😊] [بتفرج بس 👀]

لو بتفرج:
تمام! لو احتجت شيء أنا هنا 😊

لو ساعدني، اسأل:
كيف تحب تشرب قهوتك؟
CHOICES: [حارة ☕] [باردة 🧊]

لو باردة:
اسأل: تحب فاكهي ولا شيء جريء ومختلف؟
CHOICES: [فاكهي 🌸] [جريء ومغامرة 🔥]
فاكهي: وصّي بهامبيلا + قوجي كورما كزوج
مغامرة: وصّي بفيمتو + يمن لاهوائي كزوج

لو حارة:
اسأل: تحضّر فلتر V60 ولا إسبريسو؟
CHOICES: [فلتر V60 🫗] [إسبريسو ☕]

لو إسبريسو:
اسأل: مع حليب ولا بلاك؟
CHOICES: [مع حليب 🥛] [بلاك ⚫]
حليب: وصّي بالبليند + أكيا كزوج
بلاك: وصّي بكالداس + هاسيندا كزوج

لو فلتر:
اسأل: إيش يمثلك أكثر؟
CHOICES: [فاكهي 🌸] [شوكولاتي وكلاسيكي 🍫] [مغامرة ونكهات جريئة 🔥]
فاكهي: وصّي هامبيلا + قوجي كورما
شوكولاتي: وصّي أكيا + أوغندا روينزوري
مغامرة: وصّي فيمتو + يمن لاهوائي — اذكر إنها محدودة وحصرية

قواعد التوصية الذكية:

1. دايماً وصّي بزوج من المنتجات — مش منتج واحد:
"توصيتي لك منتجين يكملون بعض..."
مثال: "هامبيلا للفلتر البارد الفاكهي، وقوجي كورما لما تبي نكهة أعمق — كثير زباين يخذون الاثنين"

2. اعرض الكيلو أول، مش 250g:
"الكيلو يكفيك شهر وتوفر — أو 250g لو تبي تجرب أول"
CHOICES: [كيلو كامل ✅] [250g للتجربة]

3. بعد التوصية، اذكر البكج المناسب بجملة واحدة طبيعية:
- لو فاكهي: "وعندنا بكج الإثيوبيات بـ 189 SAR — 3 نكهات بسعر أحسن من لو اشتريتهم منفردين"
- لو مغامرة: "وعندنا بكج المحاصيل الفاخرة بـ 182 SAR لو تبي تجرب أكثر"
- لو إسبريسو: "وعندنا بكج إسبريسو وتقطير بـ 157 SAR"

4. للمنتجات اللاهوائية، أضف جملة شحّ طبيعية:
"اليمن اللاهوائي كميات محدودة هالموسم — ما يجي دايماً"

5. لا تلح أبداً — كل upsell في جملة واحدة فقط، ثم اسكت وخلّ الزبون يقرر

قواعد ثابتة:
- سؤال واحد فقط في كل رسالة
- CHOICES دايماً في نهاية الرسالة: CHOICES: [خيار1] [خيار2]
- لا توصي بمنتج مو في القائمة
- تكلم بنفس لغة الزبون دايماً بدون تعليق`;

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

function httpsPost(hostname, pathStr, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({ hostname, path: pathStr, method: 'POST', headers }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlPath = req.url.split('?')[0];

  // Serve widget.js
  if (urlPath === '/widget.js' && req.method === 'GET') {
    const widgetPath = path.join(__dirname, 'public/widget.js');
    const content = fs.readFileSync(widgetPath, 'utf8');
    res.setHeader('Content-Type', 'application/javascript');
    return res.send(content);
  }

  // OAuth callback
  if (urlPath === '/api/salla/callback' && req.method === 'GET') {
    const code = new URL(req.url, 'https://guider-app.vercel.app').searchParams.get('code');
    if (!code) return res.status(400).send('Missing code');

    const body = querystring.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.SALLA_CLIENT_ID,
      client_secret: process.env.SALLA_CLIENT_SECRET,
      redirect_uri: 'https://guider-app.vercel.app/api/salla/callback'
    });

    const token = await httpsPost('accounts.salla.sa', '/oauth2/token', {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }, body);

    if (token.access_token) {
      return res.send(`
        <h2>✅ Connected!</h2>
        <p>Access Token:</p>
        <textarea rows="4" cols="80">${token.access_token}</textarea>
        <p>Refresh Token:</p>
        <textarea rows="2" cols="80">${token.refresh_token}</textarea>
      `);
    } else {
      return res.status(500).send(`<pre>Error: ${JSON.stringify(token, null, 2)}</pre>`);
    }
  }

  // Chat endpoint
  if (urlPath === '/api/index' && req.method === 'POST') {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array required' });
      }
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages
      });
      return res.json({ reply: response.content[0].text });
    } catch (err) {
      console.error('Chat error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
};
