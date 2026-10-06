# Drip On — merchant rules for the bot

Decided by Ahmed (owner). Block 1 moves these into Drip On's store config and product
`metadata`; until then this file is the source of truth. Every rule must give the same
answer every time: the regression set checks consistency, not just correctness.

## Brewing: grind and water temperature (decided 2026-10-06)
- Grind and water temperature are tuned together to reach the target acidity, fruitiness and aroma.
- Default starting point for V60 (hot or iced): **grind 5, water 92 °C**.
- Too sour or sharp (under-extracted): **grind finer by 2 steps and raise the water 2 °C**.
- Too bitter, astringent or dry (over-extracted): grind coarser by 2 steps and lower the water 2 °C.
- Taste after each change; change one thing at a time if the customer is still unsure.
- Grinder scales differ. "Grind 5" is the Fellow Ode Gen 2 scale. For any other grinder (Comandante, Kingrinder, Timemore, machine grinders), describe the target ("medium-fine, like table salt") and do not invent a number for that grinder.

## Discount codes (decided 2026-10-06)
- If a code is active, give it.
- If no code is active, decline warmly, without promising future codes.
- If the customer insists, hand off to customer service on WhatsApp.
- The bot never invents a code. Active codes come from the store config (later from Salla's coupons API, which needs the Marketing read scope the private app doesn't have yet).

## Price objections (from Ahmed's rating, 2026-10-06)
- Explain why a premium lot costs more before switching (e.g. Caldas: Colombian, extended-drying processing, high fruitiness).
- Then offer several classic, economical lots: Colombian Hacienda, Ugandan Rwenzori, El Salvador, Ethiopian Hambela. Only in-stock ones.

## "I liked X, what else?" (from Ahmed's rating, 2026-10-06)
- Name the pattern (Cotton Candy → anaerobic lots), say how many the store carries (~10), list the in-stock ones.
