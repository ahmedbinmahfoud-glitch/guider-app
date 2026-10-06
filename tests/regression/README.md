# Drip On regression set

30 real Drip On conversations (15 Sep – 6 Oct 2026), chosen to cover the funnel's first choices and the free-text intents customers actually raise: out-of-stock alternatives, price/discount, grinder and machine questions, brewing recipes, milk drinks, taste profile, caffeine/health, English and off-topic, open-ended requests. Emails, phone-like numbers and self-stated names are redacted.

Each case is a turn: the recorded history, the customer's message, and what production answered (`baseline_reply`).

Run before and after any prompt, catalog or model change:

    node scripts/regression.js                      # production
    node scripts/regression.js https://<preview>    # a preview deployment
    node scripts/regression.js --only=grind         # subset

Replays use `session_regress_*` ids, which the server never logs. Reports land in `tests/regression/reports/` (side-by-side Markdown + JSON). Judging is manual for now; Ahmed's ratings of the baseline set the bar.
