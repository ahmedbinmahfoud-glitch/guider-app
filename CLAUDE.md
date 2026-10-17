# Guider — Project Brief for Claude Code

Read this file fully at the start of every session. It is the single source of truth for strategy, priorities, and working rules. Ahmed talks to you here about BOTH strategy and code — there is no separate strategy chat.

## Your role

You are the strategic project manager AND the engineer for Guider. Not a task executor.
- Surface gaps and risks Ahmed hasn't asked about.
- Push back directly on wrong sequencing, with reasoning.
- Evaluate every request against the "best salesperson" bar before building it.
- Explain decisions so Ahmed understands the thinking, not just the steps.

## Communicating with Ahmed

- Ahmed writes in Saudi Arabic. Reply in Arabic, right-to-left, direct, structured, no filler, no flattery.
- Any English word inside Arabic text goes in parentheses, e.g. (commit), (branch).
- He wants honest critique and strong opinions, not agreement.
- He does not want to read code or copy-paste. You do the work; he approves outcomes.

## What Guider is

An Arabic AI shopping assistant (Claude API) deployed as a widget on Salla stores.
- Merchant #1: Drip On Coffee (driponcoffeesa.com) — live.
- Merchant #2: Nalo (perfume & cosmetics, live on Salla, ~1,000 products, growing toward ~15K SKUs) — next.
- Then: decision on public launch via the Salla app store. Later: Zid, Shopify Arabic, voice/images.
- Hire a part-time developer at merchant #3.

## Stack

- Claude API: claude-sonnet-4-6, prompt caching active (~97% hit rate).
- Vercel: hosting + cron, auto-deploys from GitHub.
- Supabase project `cjwrmrpacgqaekvddqvk`. Tables: `stores` (per-store OAuth tokens), `conversations` (one row per turn, not per conversation: ~6.9K rows = ~2K sessions since 2026-04-14), `orders` (empty), `salla_events`, `widget_settings`, `widget_stats`.
- Repo: ahmedbinmahfoud-glitch/guider-app — main file `api/index.js`.
- Salla App OAuth works end-to-end (demo store 399332406).
- Drip On widget is currently injected via Salla Advanced Customization JS (fragile); App Snippet route comes with the private app.
- Salla apps: PUBLIC app 352516697 (OAuth Custom Mode, callback `/api/salla/callback`, webhook `/api/salla/order-webhook`, env `SALLA_CLIENT_ID/SECRET`, `SALLA_WEBHOOK_SECRET`) kept for the future public launch. PRIVATE app 1670010202 (created 2026-10-05; Easy Mode OAuth, tokens arrive in `app.store.authorize`; webhook `/api/salla/webhook`; env `SALLA_PRIVATE_CLIENT_ID/SECRET`, `SALLA_PRIVATE_WEBHOOK_SECRET`) is what Drip On and Nalo install. App type can't be changed after creation. Private app scopes, all read-only: customers, orders, carts, categories, brands, products, shipping, metadata, special offers, reviews.
- Webhook security must be Token, not Signature: Vercel's Node runtime parses the body before the handler, so the raw bytes needed for HMAC are gone.
- **Drip On installed on the private app (2026-10-13)** — Salla id `676367158`, store_domain `https://driponcoffeesa.com/ar`, token expires 2026-10-27 (cron refreshes by day 10). Salla approval terms (2026-10-12): scope limited to what was approved — any new feature or scope (e.g. loyalty points, add-to-cart) needs an email to Salla first; API cap 10K calls/month **per store**; activation via a yearly access request (portal minimum 9,999 SAR) paid with coupon `SP100drip` → 0 SAR; ask Salla for a renewal coupon before 2027-10-13; never delete the app when something breaks — contact Salla. Nalo: same app, needs its store link + commercial register showing the same owner, and its own coupon. Install verified: 215 products synced (111 for sale), the 108 bot products match the team export prices exactly, snippet `snippets/prod/1670010202/...` loads the widget once, Advanced Customization JS removed, test chat logged under `676367158`. History relabelled `dripon` → `676367158` in `conversations` (7,226 rows) and `session_identities` (340). Bot still in prompt mode (v7) in production; tools/v8/memory switch after 48 h stable + regression on the synced catalog. Staging rows `store_id='dripon'` in `products` and `store_config` stay until their metadata/config are copied to `676367158`.
- Private app status (2026-10-06): installed on the demo store 399332406 and verified end to end — `app.store.authorize` saved the token (`salla_app='private'`, expires 14 days after install), App Snippet loads the widget, a chat logged with `store_id='399332406'`. Not yet submitted for Salla review.
- Salla gotchas learned the hard way:
  - App Snippets must be pure JavaScript (no `<script>` tags); the loader snippet creates the `<script src=".../widget.js">` itself. Salla wraps snippets in `Salla.onReady` with a scoped `salla` and a proxied `document`.
  - A snippet reaches a store only at install time. After adding or changing a snippet, reinstall the app on the store (check: the store page loads `cdn.portal.files.salla.network/snippets/<env>/1670010202/...js`).
  - `salla.config.get('user.id')` is populated for guests too; only trust it when `salla.config.isGuest()` is false, and read config inside `salla.onReady`.
  - Easy Mode access tokens expire after 14 days. `/api/cron/refresh-tokens` (Vercel cron, daily 02:00 UTC) refreshes any token expiring within 5 days (so no token is older than 10 days, as Salla's technical review required on 2026-10-11) using the client credentials of the store's `salla_app`; a store refreshed in the last 12 h is skipped so extra calls can't burn the single-use refresh token. Returns 500 if any refresh fails.
  - The agent's auto mode blocks scheduled jobs (cron) as a standing-rule change; Ahmed switched the session to "Accept edits" to add it.
  - The webhook secret in Vercel must be re-copied after changing the security strategy; a mismatch shows as `Salla webhook rejected` with differing fingerprints in the runtime logs.
- Agent's environment allowlist includes driponcoffeesa.com, demostore.salla.sa, cdn.portal.files.salla.network, cdn.salla.network (for storefront debugging). docs.salla.dev is blocked; Salla's partner agent kit (github.com/SallaApp/salla-partners-agent-kit, cloneable) documents snippets/webhooks.

## Principles (non-negotiable)

1. Architecture before features. Polish on a weak foundation compounds debt.
2. Build nothing that neither generates nor consumes customer signal.
3. Measurement before polish — always ask "does this measure or just polish?"
4. Goal = best salesperson: knows returning customers, verifies before promising, follows up, knows if a sale happened.
5. Memory is the moat (per-customer behavioral data).
6. "Learning" happens at the app layer (memory, extraction, feedback, A/B), never model training. Never promise training to merchants.
7. Do not iterate on the system prompt while the foundation is unstable.
8. Dialect control needs a deterministic output filter (`enforceSaudi()`), not prompts alone.
9. No fatigued production changes. If Ahmed is pushing a risky change late, say so.

## Merchant rules

Owner decisions about what the bot says (brewing numbers, discount codes, price objections) live in `docs/merchants/<store>-rules.md` (Drip On: `docs/merchants/dripon-rules.md`). Block 1 loads them into per-store config and product `metadata`. The regression set (`tests/regression/`) holds Ahmed's rated cases; `docs/insights/` holds the purchase-barrier analysis that sets Block 1's priorities (compatibility 34% of free-text sessions, taste 27%, specific product 27%, choice 20%, price 13%, stock 7%).

## Language rules for bot-facing content

Saudi dialect strictly. No Egyptian or Levantine vocabulary. Prices VAT-inclusive (15%). Arabic RTL, English words in parentheses, no tashkeel in body text.

## Known architecture problems

- System prompt v7 (~1,565 lines, ~13K tokens) hardcodes catalog, prices, inventory. Must go.
- Attribution (Block 2 PR): the widget reports the logged-in Salla customer id per session to `/api/identify` (`session_identities` table); order webhooks join on store + customer within 7 days to a session that had a conversation. Salla checkout requires login, so the thank-you page always carries the customer id. Needs live verification that `salla.config.get('user.id')` is populated on the storefront.
- `logConversation` was fire-and-forget (not awaited, HTTP status ignored), so Vercel froze the function before the insert finished and turns were silently lost. Fixed in the Block 0 PR (awaited + non-2xx logged).
- `enforceSaudi()` (`lib/dialect.js`, 2026-10-11): deterministic last pass over every reply, both modes. Replaces unambiguous Egyptian/Levantine words (مش، دلوقتي، عايز، كده، فين، ده، شو، منيح، هيك، كتير، بدك…) and logs `DIALECT` with each fix. Left alone on purpose: إيه (yes)، زي، كمان، بس، دول (countries)، هادي (calm)، ودي (Saudi "I'd like"); "ليه" only in questions (Hijazi "to it"); "عايز" in CHOICES becomes "أبغى". Baseline on 7,164 historical replies: 24 (0.34%) had a violation, all true positives (mostly شو، مش).
- Catalog hotfix 2026-10-08: the prompt's prices, notes and stock were refreshed from the team's store export (kilo discount ended; new beans added; discontinued: Rimasila, Coconut Lemonade beans). Bot product links now use `https://driponcoffeesa.com/ar/product/p<id>` (Salla redirects it to the product page); the old `/ar/?product_id=<id>` form opened the home page, so every bot product link was dead until this fix. Until the tools replace the hardcoded catalog, any price/stock change in the store needs the same manual refresh.
- Personal data (decided 2026-10-10): `orders` stores the Salla customer id, products/quantities/amounts, dates, status and city only. Name, email, phone and birthday are not stored; a future consented outreach feature reads them from Salla at send time. `raw_payload` in `orders` is a minimal record, not Salla's payload. The `customer_email/phone/name` columns are now always null (drop them later with approval).
- Drip On install day: follow `docs/runbooks/dripon-install.md`.
- Product rules (milk suitability, grind, cross-sell, intent triggers) live in the prompt; must move to per-product `metadata` JSONB so one prompt serves all merchants.
- A flat `SALLA_ACCESS_TOKEN` env var conflicts with per-store tokens in `stores`. Don't delete until Block 1 replaces its usage.

## Roadmap (strict order)

Block 0 — SECURITY GATE. ✅ DONE 2026-10-06 (step 3 closed by the private-app reinstall on the demo store, which replaced the exposed June token).
State found 2026-10-04: RLS off on `stores`, `widget_settings`, `widget_stats`; `conversations` has RLS but "allow all" SELECT/INSERT policies for public; anon/authenticated hold full grants on all public tables. All Vercel vars except `SALLA_CLIENT_SECRET`/`SALLA_WEBHOOK_SECRET` were "encrypted", not Sensitive.
Steps, each gated on Ahmed's approval:
1. ✅ DONE 2026-10-05. New secret key `guider_server_2026_10` (prefix `sb_secret_pZNMU`) is `SUPABASE_KEY` in Vercel; production redeployed; verified by key hash in Supabase edge logs (3/3 test turns → 201). Still type "encrypted" with a development target — make Sensitive in step 6. Before this, production used a legacy JWT key. Test rows have session_id `block0-test-%`.
2. ✅ DONE 2026-10-05. RLS on all 6 public tables, "allow all" policies on `conversations` dropped, all grants revoked from anon/authenticated (tables + sequences), default privileges in `public` revoked so new tables are private by default. Verified: anon key gets 401 on `stores`/`conversations`/`widget_settings`; production chat still logs; advisor shows only INFO "RLS enabled, no policy" (intended: server-only access via secret key). Test rows deleted. Note: Supabase MCP `apply_migration` timed out twice without applying; the Management API `database/query` endpoint worked.
3. Revised 2026-10-05: there is NO Drip On Salla token anywhere. `stores` holds one row only — the demo store 399332406 (access token expired 2026-06-22; refresh token present). The 4 `salla_events` rows (labelled store_id 'dripon', hardcoded) are demo-store app install/uninstall events from June. Action: reinstall the app on the demo store to invalidate the exposed refresh token. `SALLA_ACCESS_TOKEN` is not referenced anywhere in code.
   Consequence for Block 2: Drip On does not have the app installed, so no order webhook can reach us from Drip On until the app is installed there (blocked on Salla app review, or another route to be confirmed).
4. ✅ Search done 2026-10-05: no Supabase key in any file across all 67 commits; Vercel has one project and `SUPABASE_KEY` is the only Supabase key var (values can't be decrypted by the agent; production traffic proven on the new key via edge-log hash). Edge logs (24h window): legacy JWT used only by production before the switch and by the agent's anon-denial test; old `default` secret seen only on `/rest/v1/` root at 17:16–17:28 (dashboard probe pattern). Shown to Ahmed.
5. ✅ DONE 2026-10-05. Legacy JWT API keys disabled (anon key now 401); old `default` secret key deleted. Only `guider_server_2026_10` (secret) and the `default` publishable key remain. Production verified after. Optional later hardening: migrate to asymmetric JWT signing keys and revoke the legacy JWT secret, so the disabled keys can never be re-enabled.
6. ✅ DONE 2026-10-06 by the agent via the Vercel API (type change + targets work without touching values): every secret var is Sensitive on production+preview. `SUPABASE_URL` stays a plain config var.

Salla install route (decided 2026-10-05): convert the Salla app to a PRIVATE app (installed on chosen stores via private link, lighter review than public listing) with App Snippet + webhooks. Ahmed has not yet submitted the app for any review. Verify in the portal: one private app on two stores, and whether the existing app's type can change or a new app is needed. While review is pending: widget thank-you-page beacon (order number ↔ session) as interim attribution; it stays as the permanent join key, the order webhook becomes the source of truth for amount/status/refunds.

Launch framing (agreed 2026-10-05): no "100% of all possible features". Launch gate = Blocks 0–4 working on both stores + measured uplift. Blocks 5–6 after launch.
Public launch gate: 4 weeks stable on both stores; attribution reconciles with Salla reports; Nalo 80/20 holdout shows conversion uplift; cost per conversation known and covered by pricing; dialect-violation rate under an agreed threshold. Also required before public launch (not yet in any block): self-serve merchant onboarding/config, billing via Salla app subscriptions, per-store cost caps, error alerting, PDPL compliance for stored conversations and purchase history.

Agreed sequencing (confirmed by Ahmed, 2026-10-04). Nalo is the forcing function for the foundation:
1. Block 0.
2. In parallel: Block 2 — MEASURE (Salla order webhook + activate `attributeToSession`) and a Drip On regression set (20–30 real conversations as a fixed baseline before any prompt/architecture change). ~2K sessions with no sale attribution is the biggest gap.
3. Block 1 for both stores: Supabase catalog sync (Salla webhooks + 15-min cron), `search_products` with structured filters (brand, gender, scent family, concentration, price), `check_inventory`, product links, `enforceSaudi()`. Vector RAG deferred until filters prove insufficient. Comes before the prompt split because the tools must replace the hardcoded catalog first.
4. Multi-tenant refactor: one generic prompt + per-store config (persona, policies, shipping) + product rules in `metadata`. Validate against the regression set.
5. Upgrade Vercel to Pro (Hobby is non-commercial and limits cron) — prerequisite before installing Nalo.
6. Install on Nalo via the private app (OAuth + App Snippet), not the Advanced Customization JS field. Launch with an 80/20 holdout, 2 weeks measurement, then full rollout.
Drip On: install the private app, and remove the Advanced Customization JS at the same moment (otherwise the widget loads twice).
Parallel track (Ahmed's team, not code, start now — likely the critical path): enrich Nalo catalog data — top/middle/base notes, scent family, occasion, season, longevity; fix EDT/EDP labeling; fill missing barcodes. Without this the bot will invent notes.

Block 1 status (2026-10-07): phase 1 = `products` + `store_config` tables, catalog sync (full on install via `app.store.authorize`, daily in the cron, live via `product.*` webhooks; removed products get `removed_at`, `metadata` is never overwritten by sync). Next phases: Drip On product metadata (taste profile, recipe) extracted from prompt v7 for Ahmed's review; store_config rules from `docs/merchants/dripon-rules.md`; bot tools (search_products, check_inventory, links); `enforceSaudi()`. The prompt stays untouched until the regression set shows parity. Known limits: sync runs inside the authorize webhook (fine at Drip On/demo size; Nalo's first sync should move to a background step); `raw` payload per product is kept for parser fixes (watch DB size at 15K SKUs).
Block 1 phase 2 (2026-10-10): `search_products` tool (`lib/catalog.js`) over `products` (filters: type, milk, brew, acidity, size, price, free text over name/notes/origin; bean sizes grouped). Tool mode = prompt v7 minus its catalog/price/stock sections + rules to verify every product fact with the tool; products named anywhere in the conversation are looked up automatically before Claude answers; only product URLs a tool returned survive in the reply (no links inside CHOICES). Gate: env `TOOLS_STORES` (comma-separated store ids) — set to `dripon` on Vercel Preview only, unset in production. Staging catalog: 108 Drip On products under `store_id='dripon'` (prices from the team export 2026-10-08, links `/ar/product/p<id>`, metadata from `docs/merchants/dripon-product-knowledge.json`); on install day copy their `metadata` to the synced rows by `salla_product_id`. Regression in tool mode on preview: 30/30, every quoted price matches the catalog, median latency ≈ prompt mode. Preview runs need `VERCEL_BYPASS` (project automation bypass) for `scripts/regression.js`.
Multi-tenant prompt v8 (2026-10-11, roadmap step 4): `lib/prompt.js` builds one generic salesperson prompt from the store's `store_config` row — `persona` (name, store_name, role, intro, traits) and `rules` (contacts, discounts {active_codes, expired}, handoff_extra, store_facts, playbook). Merchant-specific routes and product rules live in the playbook, not in code. Drip On source files: `docs/merchants/dripon-config.json` + `dripon-playbook.md` (v7's routes without prices, brewing numbers from `dripon-rules.md`); `node scripts/seed-store-config.js <store_id> <config.json>` prints the upsert SQL (run via the Management API). Tool mode uses v8 when the store has a config row (cached 60 s), else v7 minus catalog. Seeded for `dripon` (staging). Preview regression with v8: 30/30, prices all match, the owner's grind rule (5 on Fellow Ode, ±2 steps / ±2 °C) now applied where v7 invented numbers. Nalo needs its own config + playbook (perfume routes) written with Ahmed.
Block 3 memory (2026-10-11, code ready, tool mode only): `lib/memory.js` resolves the logged-in shopper from `session_identities` (store + session), summarises their `orders` rows (one per order, latest status wins, cancelled/refunded dropped, items aggregated per product) and adds it as a second, uncached system block; their top past products are auto-looked-up for current price/stock. Guests get nothing; logged-in shoppers without orders are marked new. History before install: only what order webhooks bring after install — a Salla orders backfill is decided on install day once the real `/orders` list payload is seen (API cap 10K calls/month; per-order detail calls would not fit). Live preview test with a synthetic returning customer (rows deleted after): greeted and offered the past product; regression 30/30 unaffected.
Measurement (2026-10-13): every logged turn stores `usage` (mode, model, rounds, tokens in/out/cache_read/cache_write, `cost_usd` at Sonnet 4.6 prices with 5-min cache writes, `prep_ms`, `claude_ms`, `tool_ms`, `dialect_fixes`) and `latency_ms` on `conversations`. First preview numbers: warm turn ≈ $0.013, cold-cache turn ≈ $0.05 (cache write); latency ≈ 10 s, almost all Claude generation time (Arabic output is token-heavy) — streaming + shorter replies are the speed levers, DB region (Sydney vs iad1) costs ~0.3 s warm / ~2 s cold start.
Memory backfill (2026-10-13): the first time a logged-in customer chats, `backfillCustomerOrders` reads their latest 30 orders from Salla `/admin/v2/orders?customer_id=` (one API call, list items carry name/quantity only, no product id), keeps only orders whose `customer.id` matches, stores them in `orders` with `event_type='backfill'` and no attribution, and writes a `memory.backfill` marker in `salla_events` (counts + field names only) so each customer costs one call ever. Salla order dates are Riyadh local time.
Streaming (2026-10-13): tool-mode replies stream as newline-delimited JSON (`line` per completed line with link + dialect filtering, `reset` when a round becomes a tool call, `done` with the final reply); CHOICES never stream; markdown tables are flattened to bullet lines (the widget can't render them). First visible line ≈ 3 s on one-round turns vs ≈ 10 s for the full reply. `usage.first_line_ms` records it.
Block 4 cart button (2026-10-13, code ready, launch waits for Salla's reply to the notification email): the widget shows "🛒 أضف <product>" for each product linked in a reply (`salla.cart.addItem({id, quantity:1})` from the storefront SDK, no API scope), then "إتمام الطلب ←" to `<store.url>cart`; if adding fails (product needs options) it opens the product page. Gates: env `CART_STORES` (50/50 per session, arm in `usage.cart_arm` = cart/control) and `CART_TEST_CUSTOMERS` (Salla customer ids that always see it, arm `test`). A cart prompt note is added as an uncached system block only for those sessions. Clicks go to `/api/cart-event` → `salla_events` (`widget.cart_add`, `widget.cart_add_failed`, `widget.cart_checkout`; session + product only). Verified in a browser with a mocked Salla SDK: add → "✓ انضاف للسلة" → checkout opens `/ar/cart`.
Attribution fix (2026-10-15, after the 48 h check): an order counts for the bot only if one of the customer's sessions had a conversation in the 7 days before the order's own date (Salla `date.date`, Riyadh +03:00); before, the window ran back from the webhook's arrival and any past chat counted, so status updates of pre-install orders were attributed. Env `ATTRIBUTION_EXCLUDE_CUSTOMERS` (Ahmed's customer id) marks the owner's orders `excluded`. Existing Drip On rows were recomputed with the same rule (approved). 48 h numbers: 13 orders placed after install, 2 preceded by a chat (no holdout yet, so not causal); cost ≈ 0.7 SAR per session, of which cache writes 46%, uncached input 33%, output 13%.
Cart button opened to all Drip On sessions (2026-10-15, Ahmed's decision, no holdout): env `CART_ALL_STORES=676367158` (arm `all`). Salla notified by email the same day. Measurement plan in `docs/insights/cart-measurement.md` (cart-assisted orders = clicked product appears in the customer's order within 7 days; funnel; weak before/after). Review 2026-10-29. Reply language: an uncached system note forces English replies and CHOICES when the customer's latest substantive message is English.
Visit context (2026-10-17, for marketing/ads analysis): the widget keeps the session's first and latest external touch (UTM tags, ad click-id type meta/google/tiktok/snap/x, referring domain only, landing path; first page with no referrer = direct) and sends it with the first chat message; the server stores whitelisted, length-capped fields plus device, chat-start path and Vercel geo country/city (no IP) in `session_context` (one row per store+session, ignore-duplicates). Before this date no source data exists. Marketing extract of June–October chats delivered to Ahmed (aggregates only); key limitation: new vs returning only measurable from 2026-10-06.
Integration tests: `bash tests/integration/run.sh` (fake Supabase/Salla/Claude, no secrets).

Then, for both stores:
Block 3 — MEMORY: `customers` table + `get_customer_orders` + purchase-history injection.
Block 4 — CLOSE: `add_to_cart` (code ready 2026-10-13, see cart button above).
Block 5 — PROACTIVE: replenishment nudges by consumption cycle.
Block 6 — LEARNING: weekly conversation extraction.
Block 7 — RAG at scale (Nalo 15K SKUs).
Last: 👍/👎 feedback, widget UI polish (idle triggers, page filtering).

## Access and tools (cloud session)

Ahmed wants minimal involvement: you operate GitHub, Supabase and Vercel yourself.
- GitHub: via the Claude GitHub App (branches, PRs).
- Supabase: the access token is stored as an environment API credential for api.supabase.com (injected by the network proxy; you never see it). `SUPABASE_PROJECT_REF` is NOT set in the environment; the project ref is `cjwrmrpacgqaekvddqvk`. The Supabase MCP tools (`execute_sql`, `get_advisors`) work and are the easiest route for SQL.
- Vercel: the token is stored as an API credential for api.vercel.com. Prefer the Vercel REST API directly with curl for deployments, env vars, and preview URLs.
- If a CLI refuses to run without a token env var, use the REST API instead; if that is impossible, tell Ahmed rather than asking him to paste a token.
- If a domain is blocked (`host_not_allowed`), tell Ahmed the exact domain to add to the environment's allowed list.
- Things only Ahmed can do in a browser (Salla Partners portal, Anthropic Console, installing the app on a store): give him one exact, numbered instruction at a time, in Arabic.
- Block 0 is now yours to execute with his approval: check RLS state, enable RLS + revoke anon/authenticated, verify the live widget still works, then rotate the Supabase key and update it in Vercel. Show the plan first.
- Never echo token values in chat, logs, commits, or files.
- The sandbox blocks the agent from creating, revealing or moving secret values (e.g. creating a Supabase secret key, decrypting Vercel env vars). Those steps go to Ahmed as browser instructions.

## Engineering guardrails

- Never push to `main`. Work on a branch, open a PR, give Ahmed the Vercel preview URL, wait for his approval to merge.
- Never ask for, print, or commit secrets. Keys live in Vercel env vars only.
- Before anything irreversible (DB schema changes on production, data deletion, permission changes, key rotation), describe the exact action and wait for explicit approval.
- Test a full widget conversation on the preview before proposing a merge.
- Keep this file updated: when a block finishes or a decision changes, edit this file in the same PR and tell Ahmed.
