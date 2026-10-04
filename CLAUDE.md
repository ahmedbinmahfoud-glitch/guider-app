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
- Drip On widget is currently injected via Salla Advanced Customization JS (fragile); official App Snippet route pending Salla app review.

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

## Language rules for bot-facing content

Saudi dialect strictly. No Egyptian or Levantine vocabulary. Prices VAT-inclusive (15%). Arabic RTL, English words in parentheses, no tashkeel in body text.

## Known architecture problems

- System prompt v7 (~1,565 lines, ~13K tokens) hardcodes catalog, prices, inventory. Must go.
- `attributeToSession` is a stub returning null — conversions not measured.
- `logConversation` was fire-and-forget (not awaited, HTTP status ignored), so Vercel froze the function before the insert finished and turns were silently lost. Fixed in the Block 0 PR (awaited + non-2xx logged).
- `enforceSaudi()` not built yet.
- Product rules (milk suitability, grind, cross-sell, intent triggers) live in the prompt; must move to per-product `metadata` JSONB so one prompt serves all merchants.
- A flat `SALLA_ACCESS_TOKEN` env var conflicts with per-store tokens in `stores`. Don't delete until Block 1 replaces its usage.

## Roadmap (strict order)

Block 0 — SECURITY GATE (in progress, Oct 2026). Hard prerequisite before installing any second store.
State found 2026-10-04: RLS off on `stores`, `widget_settings`, `widget_stats`; `conversations` has RLS but "allow all" SELECT/INSERT policies for public; anon/authenticated hold full grants on all public tables. All Vercel vars except `SALLA_CLIENT_SECRET`/`SALLA_WEBHOOK_SECRET` were "encrypted", not Sensitive.
Steps, each gated on Ahmed's approval:
1. New Supabase secret key → `SUPABASE_KEY` in Vercel (Sensitive, production+preview) → redeploy → verify a turn lands in `conversations`. Creating/moving the key value is done by Ahmed in the browser (the agent's sandbox blocks secret-store writes).
2. Lock down: enable RLS on all public tables, drop the "allow all" policies on `conversations`, revoke anon/authenticated. Verify widget + logging + Supabase security advisor clean.
3. Rotate Drip On's Salla OAuth token (stores was readable with the anon key).
4. Before disabling old keys: search every repo file and every Vercel env var for usage of the legacy anon/service_role JWTs and the old `default` secret key; show Ahmed the result.
5. Disable legacy JWT keys and delete the old `default` secret key (irreversible — closes the leaked key).
6. Mark remaining Vercel vars Sensitive. Add `SALLA_CLIENT_SECRET`/`SALLA_WEBHOOK_SECRET` to preview so OAuth/webhooks are testable on previews.

Agreed sequencing (confirmed by Ahmed, 2026-10-04). Nalo is the forcing function for the foundation:
1. Block 0.
2. In parallel: Block 2 — MEASURE (Salla order webhook + activate `attributeToSession`) and a Drip On regression set (20–30 real conversations as a fixed baseline before any prompt/architecture change). ~2K sessions with no sale attribution is the biggest gap.
3. Block 1 for both stores: Supabase catalog sync (Salla webhooks + 15-min cron), `search_products` with structured filters (brand, gender, scent family, concentration, price), `check_inventory`, product links, `enforceSaudi()`. Vector RAG deferred until filters prove insufficient. Comes before the prompt split because the tools must replace the hardcoded catalog first.
4. Multi-tenant refactor: one generic prompt + per-store config (persona, policies, shipping) + product rules in `metadata`. Validate against the regression set.
5. Upgrade Vercel to Pro (Hobby is non-commercial and limits cron) — prerequisite before installing Nalo.
6. Install on Nalo via the official app (OAuth + App Snippet), not the Advanced Customization JS field.
Parallel track (Ahmed's team, not code, start now — likely the critical path): enrich Nalo catalog data — top/middle/base notes, scent family, occasion, season, longevity; fix EDT/EDP labeling; fill missing barcodes. Without this the bot will invent notes.

Then, for both stores:
Block 3 — MEMORY: `customers` table + `get_customer_orders` + purchase-history injection.
Block 4 — CLOSE: `add_to_cart`.
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
