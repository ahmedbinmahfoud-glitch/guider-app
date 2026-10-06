# Drip On — what customers type before buying (2026-10-06)

**Data:** every Drip On conversation from 14 Apr to 6 Oct 2026 (2,013 sessions). Only messages customers typed themselves; button taps are excluded. That leaves 1,405 messages in 604 sessions, so 30% of sessions contain any free text.

**Method:** each message was labelled with one barrier, using the bot's previous message as context. When several labels fitted, the tie-break order was price > stock > compatibility > taste > choice. The labels come from an LLM pass and a manual spot-check, so treat them as roughly ±10%.

| Barrier | Messages | % of messages | Sessions | % of free-text sessions |
|---|---|---|---|---|
| Compatibility: will it work with my tools/method (recipes, grinder, machine, milk, cold) | 389 | 27.7 | 206 | 34.1 |
| Taste: will I like it (acidity, bitterness, flavour, caffeine) | 242 | 17.2 | 166 | 27.5 |
| Specific product request (navigation, not a doubt) | 217 | 15.4 | 161 | 26.7 |
| Choice: don't know what to pick | 173 | 12.3 | 120 | 19.9 |
| Price: discount codes, offers, "expensive" | 115 | 8.2 | 79 | 13.1 |
| Social (greetings, thanks) | 94 | 6.7 | 65 | 10.8 |
| Order/service (shipping, wholesale, complaints) | 80 | 5.7 | 62 | 10.3 |
| Stock: availability, sold out | 48 | 3.4 | 40 | 6.6 |
| Other (bot identity, tests, unclear) | 45 | 3.2 | 33 | 5.5 |
| Language | 2 | 0.1 | 2 | 0.3 |

Read sessions, not messages: one long recipe thread counts once per message, which inflates compatibility.

## Notes
- Most price messages are requests for discount codes, plus complaints that a code didn't apply at checkout.
- Inside compatibility, most messages are brewing recipes (cold, V60, espresso shots) and grinder numbers. This is where the regression set found the bot giving different numbers for the same question.
- "Other" includes customers annoyed by the bot ("every time you correct the amounts… how do I remove you?").
- Not yet linked to purchases. Once order webhooks flow from Drip On, conversion rate per barrier answers which barrier costs the most sales.
- Next version: count button taps that state a barrier ("ما أحب الحامض", "ما أعرف") alongside free text.
