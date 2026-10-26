// enforceSaudi: deterministic last pass over every bot reply. Replaces
// Egyptian and Levantine words with their Saudi equivalent and reports what it
// changed, so the dialect-violation rate can be measured (launch gate).
//
// Only unambiguous words are listed. Words that are also Saudi or have another
// meaning are deliberately left alone: "إيه" (yes), "زي", "كمان", "بس", "هاي",
// "دول" (countries), "بقى" (remained), "هادي" (calm), "حاجة", "لسه".

// Arabic letters and diacritics only, so Arabic punctuation (، ؟ ؛) counts as
// a word boundary.
const AR = '\u0621-\u064A\u064B-\u0652\u0671-\u06D3';
// [wrong, right]. Matched as whole words, optionally prefixed by و or ف.
const PAIRS = [
  // Egyptian
  ['دلوقتي', 'الحين'], ['دلوقت', 'الحين'],
  // In CHOICES the customer speaks, so "عايز" means "I want".
  ['عايزين', 'تبغون'], ['عايزة', 'تبغين', { choices: 'أبغى' }], ['عايزه', 'تبغين', { choices: 'أبغى' }], ['عايز', 'تبغى', { choices: 'أبغى' }],
  ['عاوزين', 'تبغون'], ['عاوزة', 'تبغين', { choices: 'أبغى' }], ['عاوز', 'تبغى', { choices: 'أبغى' }],
  ['كده', 'كذا'], ['كدا', 'كذا'],
  ['مش', 'مو'],
  ['فين', 'وين'],
  // "ليه" is also Hijazi for "to it"; only the question form is replaced.
  ['ليه', 'ليش', { questionOnly: true }],
  ['ازاي', 'كيف'], ['إزاي', 'كيف'],
  ['ده', 'هذا'], ['دي', 'هذي', { noPrefix: true }], // "ودي" is Saudi for "I'd like"
  ['بتاعتك', 'حقتك'], ['بتاعك', 'حقك'], ['بتاعنا', 'حقنا'], ['بتاع', 'حق'],
  ['اوي', 'مرة'], ['أوي', 'مرة'],
  ['النهارده', 'اليوم'], ['النهاردة', 'اليوم'],
  // Levantine
  ['هلق', 'الحين'], ['هلأ', 'الحين'],
  ['هيك', 'كذا'],
  ['شو', 'وش'],
  ['منيح', 'زين'], ['منيحة', 'زينة'],
  ['كتير', 'كثير'],
  ['بدك', 'تبغى'], ['بدي', 'أبغى'],
  ['هاد', 'هذا'], ['هادا', 'هذا'],
];

const RULES = PAIRS
  .sort((a, b) => b[0].length - a[0].length)
  .map(([wrong, right, opts = {}]) => ({
    wrong, right, choices: opts.choices || right,
    re: new RegExp(`(^|[^${AR}])(${opts.noPrefix ? '' : '[وف]?'})${wrong}` +
      (opts.questionOnly ? `(?=[^${AR}][^.!\\n؟?]{0,40}[؟?]|[؟?])` : `(?=[^${AR}]|$)`), 'g')
  }));

// Returns { text, changes: [{ wrong, right, count }] }.
// Text inside markdown link targets "(...)" is not touched.
function enforceSaudi(input) {
  if (typeof input !== 'string' || !input) return { text: input, changes: [] };
  const cut = input.indexOf('CHOICES:');
  const segments = cut === -1 ? [[input, false]] : [[input.slice(0, cut), false], [input.slice(cut), true]];
  const counts = new Map();
  const out = segments.map(([seg, inChoices]) => {
    // Odd indexes are left untouched: whole markdown links (product names in
    // the label are often French/Italian, e.g. "بروفومو دي فيوري") and
    // "او دي/أو دي" ("eau de" in perfume names).
    const parts = seg.split(/(\[[^\]]*\]\([^)]*\)|[اأ]و د[يو] )/);
    for (let i = 0; i < parts.length; i += 2) {
      let t = parts[i];
      for (const r of RULES) {
        t = t.replace(r.re, (all, pre, prefix) => {
          counts.set(r.wrong, (counts.get(r.wrong) || 0) + 1);
          return pre + prefix + (inChoices ? r.choices : r.right);
        });
      }
      parts[i] = t;
    }
    return parts.join('');
  });
  const changes = [...counts].map(([wrong, count]) => ({ wrong, right: RULES.find(r => r.wrong === wrong).right, count }));
  return { text: out.join(''), changes };
}

module.exports = { enforceSaudi };
