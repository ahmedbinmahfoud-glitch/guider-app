#!/usr/bin/env node
// Replays the Drip On regression set against a Guider deployment and writes a
// side-by-side report (baseline reply vs. new reply) for review.
//
//   node scripts/regression.js [baseUrl] [--only=<case-id-substring>]
//
// baseUrl defaults to production. For a protected Vercel preview, set
// VERCEL_BYPASS to the project's automation-bypass secret.
// baseUrl defaults to production. Each case sends its recorded history plus the
// user turn with a `session_regress_*` id, which the server never logs, so runs
// don't pollute conversation data or analytics.
const fs = require('fs');
const path = require('path');

const BASE = (process.argv.find(a => /^https?:\/\//.test(a)) || 'https://guider-app.vercel.app').replace(/\/$/, '');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const ORIGIN = 'https://driponcoffeesa.com';
const CONCURRENCY = 3;

const dir = path.join(__dirname, '..', 'tests', 'regression');
const { cases } = JSON.parse(fs.readFileSync(path.join(dir, 'dripon_baseline.json'), 'utf8'));
const selected = cases.filter(c => !ONLY || c.id.includes(ONLY));

async function run(c) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/index`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Origin': ORIGIN,
        ...(process.env.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.VERCEL_BYPASS } : {})
      },
      body: JSON.stringify({
        messages: [...c.history, { role: 'user', content: c.user }],
        sessionId: `session_regress_${c.source}`
      })
    });
    const body = await res.json().catch(() => ({}));
    return { ...c, status: res.status, reply: body.reply || body.error || '', ms: Date.now() - started };
  } catch (err) {
    return { ...c, status: 0, reply: `ERROR: ${err.message}`, ms: Date.now() - started };
  }
}

(async () => {
  const results = [];
  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    results.push(...await Promise.all(selected.slice(i, i + CONCURRENCY).map(run)));
    process.stdout.write(`${results.length}/${selected.length}\r`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(dir, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${stamp}.json`), JSON.stringify({ base: BASE, results }, null, 1));
  const md = [`# Regression run ${stamp}`, `Target: ${BASE}`, ''];
  for (const r of results) {
    md.push(`## ${r.id} (${r.category}) — HTTP ${r.status}, ${r.ms} ms`, '',
      `**Customer:** ${r.user}`, '', '**Baseline:**', '', r.baseline_reply, '', '**New:**', '', r.reply, '', '---', '');
  }
  fs.writeFileSync(path.join(outDir, `${stamp}.md`), md.join('\n'));
  const failed = results.filter(r => r.status !== 200).length;
  console.log(`\n${results.length} cases, ${failed} failed. Report: tests/regression/reports/${stamp}.md`);
  process.exitCode = failed ? 1 : 0;
})();
