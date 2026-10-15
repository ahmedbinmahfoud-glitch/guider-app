# Cart button — how success is measured (Drip On, opened to all sessions 2026-10-15)

Ahmed chose to open the button to every session (no holdout), so there is no
control group. Success is measured three ways, strongest first.

## 1. Cart-assisted orders (direct, primary)
An order counts as cart-assisted when the customer clicked "🛒 أضف" for a
product in the 7 days before the order **and that product is in the order**.
Join: `salla_events` (`widget.cart_add`, session + product) → `session_identities`
(session → customer) → `orders` (`order.created`, same customer, item `product_id`
matches, order date within 7 days after the click). Report count, revenue and
share of all orders.

## 2. Funnel per chat session
chat sessions → sessions where the bot linked a product → `widget.cart_add`
→ `widget.cart_checkout` → attributed order. A drop between steps shows where
to work (e.g. many adds, few checkouts = cart/checkout friction, not the bot).
`widget.cart_add_failed` counts products that need options on their page.

## 3. Before/after conversion (weak, context only)
Attributed orders ÷ chat sessions, before vs after launch. Baseline before the
button (2026-10-13 14:00 → 2026-10-15): 11 chat sessions, 6 logged in,
2 attributed orders. The sample is tiny and seasonal effects are not
controlled, so this is never quoted alone.

## Decision rule
Review after 2 weeks (2026-10-29). If cart-assisted orders are near zero while
adds are high, investigate checkout; if adds are near zero, the button
placement/wording is the problem, not demand.
