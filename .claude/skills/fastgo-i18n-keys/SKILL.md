---
name: fastgo-i18n-keys
description: Add, change or remove FastGo user-visible strings in fr, ar and en in one step. Use for any new UI text, error code or catalog cleanup in packages/i18n.
---

# Tri-lingual catalog keys

Needs bash and Python 3; does not run in PowerShell.

1. Write the keys once as a Python dict whose leaves are `(fr, en, ar)` tuples, in a scratch file:
   `T = {"order": {"price": {"title": ("Votre prix", "Your price", "السعر")}}}`
2. `python3 .claude/skills/fastgo-i18n-keys/merge.py <keys.py>`: deep-merges into `packages/i18n/src/messages/{fr,en,ar}.json` and regenerates `AR-REVIEW.md`. To remove keys: `python3 .claude/skills/fastgo-i18n-keys/merge.py --remove order.address.noSuggestion ...`.
3. `pnpm --filter @fastgo/i18n test` (parity, placeholders, no "10 min", AR-REVIEW in sync).

Rules:
- `{name}` placeholders take strings, numbers or dates only. For `<Money>`, `<Ltr>`, `<DateTime>` or links use empty tags in the message (`Dès <amount></amount>`) and `t.rich(key, { amount: () => <Money .../> })`.
- Plurals: ICU `{count, plural, one {...} other {...}}`; Arabic needs `one two few many other`.
- Business placeholders stay in brackets: `[PRIX]`, `[HEURE]`, `[PLAFOND]`... Never invent values.
- Every new Arabic string needs a native-speaker review (AR-REVIEW.md lists it).
