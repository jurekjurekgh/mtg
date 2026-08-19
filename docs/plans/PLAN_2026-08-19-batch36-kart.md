# PLAN Batch 36 — 10 kart (2026-08-19)

Lista właściciela. Oracle ze Scryfalla (docs/cards/scryfall-*.json, pobrane
2026-08-19, ADR 0010 §2a).

## Karty

| Karta | Set | Koszt | Typ | Mechaniki |
|-------|-----|-------|-----|-----------|
| Wretched Banquet | CON | {B} | Sorcery | Destroy target creature IF it has least power (or tied) |
| Molten Nursery | BFZ | {2}{R} | Enchantment | Devoid; when you cast a colorless spell → 1 dmg any target |
| Mysteries of the Deep | WWK | {4}{U} | Instant | Draw 2; Landfall — draw 3 instead if land entered under your control this turn |
| Omenspeaker | THS | {1}{U} | Creature 1/3 Human Wizard | ETB scry 2 |
| Piercing Rays | MH2 | {1}{W} | Sorcery | Exile target tapped creature; Forecast {2}{W}: tap target untapped (upkeep only, once/turn) |
| Ghoulcaller's Bell | ISD | {1} | Artifact | {T}: each player mills a card |
| Feral Invocation | THS | {2}{G} | Aura (flash) | +2/+2 |
| Grizzled Leotau | ARB | {G}{W} | Creature 1/5 Cat | — |
| Survivor of Korlis | BRO | {W} | Creature 1/1 Human Soldier | First strike; {1}{W}, exile from GY: scry 2 |
| Emerald Oryx | M10 | {3}{G} | Creature 2/3 Antelope | Forestwalk |

## Nowe generyczne mechaniki (ADR 0002)

1. **destroy_if_least_power** — Wretched Banquet: zniszcz cel, gdy ma najmniejszą
   moc na polu bitwy (lub remisuje o nią).
2. **Devoid + trigger bezbarwnego czaru** — Molten Nursery: `spellIsColorless`
   w condition triggera; obrażenia do any target (cel triggera).
3. **Landfall w czarze** — Mysteries: warunek `landEnteredThisTurn` w efekcie
   `conditional` (jak Trade Route Envoy) — dobierz 3 zamiast 2.
4. **Forecast (CR 702.94)** — Piercing Rays: zdolność z RĘKI, tylko upkeep,
   raz na turę, koszt „reveal this card from hand".
5. **Forestwalk (landwalk, CR 702.33?)** — Emerald Oryx: nieblokowalność,
   gdy obrońca kontroluje Forest.
6. **mill each player** — Ghoulcaller's Bell: `mill_cards` dla obu graczy.

## Reuse (bez nowych mechanik)

- Omenspeaker: scry 2 (ETB trigger).
- Feral Invocation: flash aura +2/+2 (Serra's Embrace wzorzec).
- Grizzled Leotau: zwykły stwór 1/5.
- Survivor of Korlis: first strike + fromGraveyard/exileFromGraveyard + scry
  (Goldmeadow Nomad wzorzec).

## Kryteria ukończenia (checklista każdego commitu)

- [ ] Definicje w card-data.js z Oracle ze Scryfalla
- [ ] Testy (legalne/nielegalne scenariusze)
- [ ] Talie singleton zaktualizowane
- [ ] `npm test` zielony
- [ ] `npm run build` zielony

## Plan commitów

1. ~~Plan + dane Scryfall~~ — zrobione
2. ~~Reuse (4 karty)~~ — zrobione (E1)
3. ~~Ghoulcaller's Bell + Emerald Oryx~~ — zrobione (E2)
4. ~~Wretched Banquet + Mysteries of the Deep~~ — zrobione (E3)
5. ~~Molten Nursery + Piercing Rays~~ — zrobione (E4)
6. ~~Dokumentacja~~ — PROJECT_STATE + handoff + b18

## Ryzyka

- Forecast to nowa mechanika z ograniczeniem „tylko upkeep" — wymaga odrębnej
  oferty z ręki (wzorzec cycling/channel).
- Forestwalk wymaga stanu „defending player controls Forest" w combacie.

## Podsumowanie

Batch 36 kompletny: **10/10 kart**. Nowe mechaniki: destroy_if_least_power,
spellIsColorless (Devoid), landEnteredThisTurn (landfall w czarze),
mill_both_players, landwalk/forestwalk, Forecast (CR 702.94).
test:all 2345/2345, build 51 / 1980.0 kB, benchmark 0 crashy.
