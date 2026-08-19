# PLAN M146 — kontynuacja Batch 35 (pozostałe 6 kart)

## Kontekst (aktualizacja 2026-08-18 po mergu PR #63)

PR #63 (M145) został **scalony do main** — zrealizował 4 z 10 kart Batch 35
(Titan's Strength, Wolfkin Bond, Mark of the Vampire, Simian Simulacrum) oraz
pełny audyt PR #62 (`docs/audits/AUDYT_PR62_2026-08-18.md`). Scryfall data
dla wszystkich 10 kart jest już w `main` (docs/cards/).

Ta sesja dokańcza pozostałe 6 kart. **Źródłem prawdy jest Scryfall** — stary
plan `PLAN_2026-08-18-batch35-kart.md` ma zmyślony Oracle dla 6 kart (został
jako historyczny).

## Karty do zrealizowania (Oracle ze Scryfalla — prawda)

| Karta | Set | Koszt | Typ | Oracle (prawda) |
|-------|-----|-------|-----|-----------------|
| Trade Route Envoy | TDM | {3}{G} | Creature — Dog Soldier 4/3 | ETB: dobierz, jeśli kontrolujesz stwora z licznikiem; inaczej +1/+1 licznik |
| Twiddle | 8ED | {U} | Instant | You may tap or untap target artifact, creature, or land |
| Steelfin Whale | MH2 | {5}{U} | Creature — Whale 3/4 | Affinity for artifacts; artifact ETB → untap ~ |
| Blazing Torch | ISD | {1} | Artifact — Equipment | Equip {1}; no block by Vampires/Zombies; equipped creature: {T}, Sac: 2 dmg any target |
| Basilisk Gate | CLB | — | Land — Gate | {T}: {C}; {2},{T}: +X/+X, X = Gates you control (sorcery only) |
| Mindstab | TSP | {5}{B} | Sorcery | Target player discards 3; Suspend 4 — {B} |

## Nowe generyczne mechaniki (ADR 0002)

1. ~~ETB counter-check~~ — Trade Route Envoy: generyczny `conditional` (if/then/else) — ZROBIONE
2. ~~Modal tap/untap~~ — Twiddle: tryb wybrany przy rzucie — ZROBIONE
3. ~~Affinity for artifacts~~ — Steelfin Whale: redukcja kosztu o {1} za każdy artefakt — ZROBIONE
4. ~~Granted ability z sacrifice~~ — Blazing Torch: `equipment.grantedAbilities` + tapHost — ZROBIONE
5. ~~Gate subtype + X z liczby Gates~~ — Basilisk Gate: `pump_by_gates` — ZROBIONE
6. ~~Suspend~~ — Mindstab: pełna mechanika CR 702.62 z jednorazową decyzją — ZROBIONE

## Kryteria ukończenia (checklista każdego commitu)

- [x] Definicje w card-data.js z Oracle ze Scryfalla
- [x] Testy (legalne/nielegalne scenariusze)
- [x] Talie singleton zaktualizowane
- [x] `npm test` zielony
- [x] `npm run build` zielony

## Plan commitów

1. ~~Plan i audyt~~ — plan w tym pliku; audyt PR #62 zrobiony w M145 (scalony)
2. ~~Dane Scryfall~~ — już w main (docs/cards/scryfall-*.json)
3. ~~Trade Route Envoy + Twiddle~~ — commit E3
4. ~~Steelfin Whale + Blazing Torch~~ — commit E3
5. ~~Basilisk Gate~~ — commit E3
6. ~~Mindstab + suspend~~ — commit E3b (CR 702.62 z jednorazową decyzją)
7. ~~Dokumentacja~~ — PROJECT_STATE.md + handoff w tym commicie

## Podsumowanie wykonania

- Batch 35 kompletny: **10/10 kart** (4 z M145 + 6 z M146).
- `npm run test:all` **2303/2303**, build 51 modułów / 1953.8 kB.
- Benchmark szybki 0 crashy: heuristic 67.5% vs aggro / 92.6% vs random.
- Audyt PR #63 (najnowszy scalony PR) w `docs/audits/AUDYT_PR63_2026-08-18.md`.
- Suspend zaimplementowany wg CR 702.62 z uwagą właściciela (jednorazowa
  decyzja, bez trzymania karty w exile na kolejne tury).
