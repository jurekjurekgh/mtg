# PLAN Batch 37 — 10 kart (2026-08-19)

Lista właściciela. Oracle ze Scryfalla (pobrane 2026-08-19, ADR 0010 §2a).

## Karty

| Karta | Set | Koszt | Typ | Mechaniki |
|-------|-----|-------|-----|-----------|
| Returned Centaur | ORI | {3}{B} | Creature 2/4 | ETB: target player mills 4 |
| Static Net | BRO | {3}{W} | Enchantment | ETB: exile nonland till leaves + gain 2 life + tapped Powerstone |
| Liliana's Triumph | WAR | {1}{B} | Instant | Each opponent sacrifices a creature |
| Strandwalker | MBS | {5} | Equipment | **Living weapon**; +2/+4, reach; Equip {4} |
| Ojutai's Breath | DTK | {2}{U} | Instant | Tap, doesn't untap; **Rebound** |
| Satyr Wayfinder | M15 | {1}{G} | Creature 1/1 | ETB: reveal top 4, land to hand, rest to grave |
| Village Bell-Ringer | ISD | {2}{W} | Creature 1/4 | Flash; ETB: untap all creatures you control |
| Urza's Mine | 2XM | — | Land — Urza's Mine | {T}: {C}; tron: {C}{C} with PP+Tower |
| Palace Familiar | DTK | {1}{U} | Creature 1/1 | Flying; dies: draw a card |
| Thornhide Wolves | M19 | {4}{G} | Creature 4/5 | — |

## Nowe mechaniki

1. **Living weapon (CR 702.91)** — Strandwalker: ETB create 0/0 germ + attach. Token-germ.
2. **Rebound (CR 702.97)** — Ojutai's Breath: exile as resolves, free cast in next upkeep.
3. **Linked exile** — Static Net: exile until source leaves (banish+link jak Faceless Butcher).
4. **Powerstone token** — artifact: {T}: {C} (only for artifact spells). Restricted mana.
5. **Tron (Urza's Mine)** — sprawdza obecność dwóch innych kart po cardId w MANA_SOURCE_MAP.
6. **Reveal top N, pick land** — Satyr Wayfinder: nowy pendingEffect.
7. **Untap all creatures** — Village Bell-Ringer: `untap_all_creatures_you_control`.
8. **Reuse:** mill target player (Returned), sacrifice each opponent (Liliana), tap+dont_untap (Ojutai), dies draw (Palace).

## Plan commitów

1. Plan + dane Scryfall
2. Reuse (Returned, Liliana, Palace, Thornhide)
3. Ojutai's Breath (dont_untap + rebound)
4. Village Bell-Ringer + Satyr Wayfinder (untap all + reveal/pick land)
5. Static Net (linked exile + powerstone)
6. Strandwalker (living weapon) + Urza's Mine (tron)
7. Dokumentacja