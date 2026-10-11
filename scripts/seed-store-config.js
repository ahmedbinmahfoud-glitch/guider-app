#!/usr/bin/env node
// Prints the SQL that upserts a store's prompt-v8 config into store_config.
//   node scripts/seed-store-config.js <store_id> docs/merchants/<store>-config.json
// rules.playbook_file (relative to the config file) is inlined as rules.playbook.
const fs = require('fs');
const path = require('path');
const [storeId, file] = process.argv.slice(2);
if (!storeId || !file) { console.error('usage: seed-store-config.js <store_id> <config.json>'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const rules = { ...cfg.rules };
if (rules.playbook_file) {
  rules.playbook = fs.readFileSync(path.join(path.dirname(file), rules.playbook_file), 'utf8');
  delete rules.playbook_file;
}
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
console.log(`insert into store_config (store_id, persona, rules, updated_at) values (${q(storeId)}, ${q(JSON.stringify(cfg.persona))}::jsonb, ${q(JSON.stringify(rules))}::jsonb, now())
on conflict (store_id) do update set persona = excluded.persona, rules = excluded.rules, updated_at = now();`);
