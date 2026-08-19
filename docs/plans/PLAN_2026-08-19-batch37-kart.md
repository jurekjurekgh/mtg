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

1. ~~Plan + dane Scryfall~~ — zrobione (PR #64)
2. ~~Reuse (Returned, Liliana, Palace, Thornhide)~~ — zrobione (M147 transza A:
   artId/plan ze słownika, talie green/black/azorius + karty i lądy wg M132,
   seedy 5 testów przelosowane hunterem L25).
3. ~~Village Bell-Ringer (untap_all_creatures_you_control)~~ — zrobione
   (M147 transza B: nowy efekt generyczny `untap_all_creatures_you_control`
   + opis w render.js, talia azorius +1 karta +1 ląd, seed przelosowany L25).
4. ~~Liliana's Triumph (planeswalker) + Urza's Mine (tron)~~ — zrobione
   (M147: efekty warunkowe zakodowane Z WYPRZEDZENIEM — decyzja właściciela
   2026-08-19. Liliana: `conditional controlsPlaneswalkerWithSubtype` w
   effects.js; Urza's Mine: tron już w mana-sources.js (tronRequired), dodana
   karta. Oba działają od razu po dodaniu kart wyzwalających. Talia mechanicy
   +Urza's Mine.)
5. ~~Ojutai's Breath (dont_untap + rebound)~~ — zrobione (M147: nowa mechanika
   **rebound** CR 702.97 — exile po rozstrzygnięciu gdy rzucony z ręki,
   jednorazowa decyzja rzutu bez kosztu na początku następnego upkeepu;
   efekty generyczne przez registry→identity→state, jak suspend.)
6. ~~Fix CI (szybki rdzeń vs test:all)~~ — zrobione (M147: błąd root cause —
   oferta decyzji w playerView była w innej kolejności niż bramki execute:
   `optional_trigger` przed `suspend`/`rebound`, więc przy współistniejących
   decyzjach bot brał ofertę odrzucaną bramką `suspend_unresolved`/
   `rebound_unresolved`. Naprawione: kolejność ofert zgodna z execute + guardy
   `pendingSuspendCast`/`pendingReboundCast` w bloku akcji normalnych.)
7. ~~Satyr Wayfinder (reveal top 4, pick land to hand, rest to grave)~~ — zrobione
   (M147: nowy pending `pendingSatyrLook` + komenda `resolve_satyr_look_choice`;
   efekt `reveal_top_pick_land_rest_grave` — odsłoń 4, możesz wziąć ląd do ręki,
   reszta do grobu; oba boty, opisy UI, fingerprint. Talia green +1 karta.)
8. ~~Static Net (linked exile + powerstone)~~ — zrobione (M147: efekt
   `exile_nonland_permanent_linked` — linked exile nie-lądowego permanentu
   przeciwnika do LTB (jak Faceless Butcher); token Powerstone (zatapnięty,
   {C} — restrykcja artefaktowa nieimplementowana, notes); create_token
   wspiera `tapped`. Talia azorius +1 karta +1 ląd.)
9. ~~Strandwalker (living weapon)~~ — zrobione (M147: nowy efekt `living_weapon`
   — utwórz 0/0 Germ i przypnij sprzęt (CR 702.91, jak job_select); token
   Germ; +2/+4 i reach przez equipment. Talia mechanicy +1 karta.)
10. Dokumentacja