# PLAN Batch 35 — 10 kart (2026-08-18)

## Karty

| Karta | Set | Koszt | Typ | Mechaniki |
|-------|-----|-------|-----|-----------|
| Titan's Strength | ORI | {R} | Instant | +3/+1, scry 1 |
| Wolfkin Bond | M20 | {4}{G} | Enchantment Aura | +2/+2, tworzy 2/2 Wolf token |
| Trade Route Envoy | TDM | {1}{W} | Creature — Human Scout | 1/1, gdy ETB: choose a color, ~ can't be blocked by creatures of that color |
| Twiddle | 8ED | {U} | Sorcery | Tap or untap target artifact, creature, or land |
| Steelfin Whale | MH2 | {6}{U} | Artifact Creature — Whale | 3/5, affinity to artifacts, instant/sorcery koszt mniej gdy kontrolujesz artefakt |
| Blazing Torch | ISD | {1} | Artifact Equipment | Equip {1}, Sac: deal 2 damage to target creature |
| Simian Simulacrum | BRO | {4} | Artifact Creature — Ape | 3/2, haste, gdy dies: draw 1 card |
| Mark of the Vampire | M14 | {3}{B}{B} | Enchantment Aura | +2/+2, lifelink |
| Basilisk Gate | CLB | — | Land | ETB tapped, T: Add C, T: Add one mana of any color, activate only if 2+ other Gates |
| Mindstab | TSP | {4}{B}{B} | Sorcery | Target player discards 3 cards. Suspend 4 — {1}{B} |

## Nowe mechaniki / generyczne rozszerzenia

1. **can't be blocked by color** — Trade Route Envoy: wybor koloru przy ETB, blokada blokowania przez stwory tego koloru
2. **tap X or untap X** — Twiddle: wybor (tap/untap) jako czar
3. **affinity to artifacts** — Steelfin Whale: redukcja kosztu za liczbę artefaktow
4. **sacrifice equipment for damage** — Blazing Torch: koszt poswiecenia + efekt obrazen
5. **dies → draw** — Simian Simulacrum: trigger dies + draw card
6. **+2/+2 lifelink aura** — Mark of the Vampire: prosty buff aury
7. **Gate land** — Basilisk Gate: enters tapped, produkuje jedna mana dowolnego koloru przy 2+ Gates
8. **suspend** — Mindstab: Suspend 4 z kosztem {1}{B}, target player discard 3
9. **scry na czarze** — Titan's Strength: instant z scry 1

## Kryteria ukonczenia

- [ ] Scryfall data dla kazdej karty
- [ ] Definicje w card-data.js
- [ ] Testy (legalne/nielegalne scenariusze)
- [ ] Talie singleton zaktualizowane (dopisane karty)
- [ ] npm test zielony
- [ ] npm run build zielony
