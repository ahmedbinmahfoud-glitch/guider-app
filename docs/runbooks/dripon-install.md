# Drip On install day (private app 1670010202)

Run this the day Salla approves the private app. Ahmed does the browser steps; the agent verifies after each one. Do not start late in the day: if something breaks, the old JS has to go back the same day.

## Before
- Production is green: a chat on driponcoffeesa.com answers and logs.
- Ahmed copies the full text of the Advanced Customization JS (the current widget loader) into a safe note. This is the rollback.

## Steps
1. **Ahmed:** installs the private app on Drip On from the private install link (Salla Partners → the app → private link), logged in as the Drip On owner.
2. **Agent verifies:**
   - `stores` has a row for Drip On's Salla id, `salla_app='private'`, `is_active=true`, token present, `expires_at` ≈ install + 14 days.
   - `store_domain` is `https://driponcoffeesa.com` (the widget's allowed origin is built from it; www and non-www are both allowed).
   - `products` holds Drip On's catalog (≈100+ active rows) and the prices match the store.
   - `salla_events` shows `app.installed`.
3. **Ahmed, right after step 2 passes:** deletes the widget loader from the Advanced Customization JS field and saves. Until this is done the store loads the widget twice (snippet + old JS).
4. **Agent verifies:**
   - The storefront loads `cdn.portal.files.salla.network/snippets/.../1670010202/...js` and the widget appears once.
   - A test chat logs in `conversations` with `store_id` = Drip On's Salla id (not `dripon`).
   - A logged-in visit writes `session_identities` with the same store id.
5. **Agent, with Ahmed's approval:** relabels history from `dripon` to the Salla id in `conversations` and `session_identities`, so analytics stay continuous and customers who chatted in the 7 days before install still get their orders attributed.
6. **First real order:** agent checks that `orders` received it, with `store_id` = Salla id, no contact details stored, and `session_id` filled when the customer had chatted.

## After (follow-up PR)
- Remove the `STATIC_ORIGINS` entries for driponcoffeesa.com once steps 1–6 hold for 48 h, so Drip On has exactly one store id.
- Switch the bot from the hardcoded catalog to the Block 1 tools after the regression set shows parity on Drip On's synced catalog.

## Rollback
- Widget missing or broken: Ahmed pastes the saved JS back into Advanced Customization. The app can stay installed; the agent then fixes forward.
- Never uninstall the app as a quick fix: it deactivates the store row and clears its tokens, and reinstalling issues a new token.
