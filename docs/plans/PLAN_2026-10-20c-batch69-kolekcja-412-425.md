# Plan: batch 69 — kolekcja 412–425 (10 kart)

Data: 2026-10-20. Gałąź: `arena/3ce2ec34-mtg`, PR #168 (osobny commit do tego samego PRa, ADR 0020).
Numer batcha 69 jest przypuszczalny (batch 68 = kolekcja 400–411).

## Zakres i zasady (wiążące)

- Lista kart pochodzi od właściciela. Pole `plan` jest wiążące i nie wolno go poprawiać.
- Każda karta `supported` ma mechaniki w 100%; `support.limitations` puste.
- Talie przydziela wyłącznie `tools/generate-plan-decks.mjs`. Nie tworzymy `decks/real-batchN.txt`.
- `artId` ze słownika `tools/collection-art-ids.csv`. Bez warunków na nazwę karty.
- Dane Scryfall: snapshoty `docs/cards/scryfall-<slug>.json` (pola + `rulings`, ADR 0028).

## Lista (kolekcja → karta → plan)

| artId | Karta | Plan |
|---|---|---|
| 412OGW | Makindi Aeronaut | Zendikar |
| 413APC | Bloodfire Infusion | Warhammer Fantasy |
| 414_2X2 | Tuskguard Captain | Kaldheim |
| 415DMR | Kavu Primarch | Dominaria |
| 416FDN | Fleeting Flight | Forgotten Realms |
| 417VOW | Heron-Blessed Geist | Innistrad |
| 418ZEN | Ior Ruin Expedition | Zendikar |
| 423CLB | Gnoll War Band | Forgotten Realms |
| 424RNA | Gruul Beastmaster | Ravnica |
| 425MH2 | Myr Scrapling | Mirrodin |

Wiersze 419DSK, 420ISD, 421BRO, 422CMR już są w słowniku, ale nie należą do tej partii. Nie są ruszane.

## Inwentarz mechanik (stan kodu na 3ae315a)

| Karta | Mechaniki | Status w silniku |
|---|---|---|
| Makindi Aeronaut | Flying | istnieje |
| Bloodfire Infusion | Aura „Enchant creature you control”; `{R}`, sacrifice enchanted creature: damage = jej moc każdemu stworowi | **do zrobienia**: koszt „poświęć stwora, do którego jestem dołączony”; damage LKI mocy |
| Tuskguard Captain | Outlast; statyczny trample dla stworów z licznikiem +1/+1 | outlast istnieje; trample warunkowy — **weryfikacja** |
| Kavu Primarch | Kicker `{4}`; Convoke; kicked → 4 liczniki przy wejściu | kicker istnieje; liczniki „if kicked” — **rozszerzenie** `entersWithCountersIf`; **convoke — nowe** |
| Fleeting Flight | +1/+1 counter, flying do końca tury, prevent combat damage do celu | **weryfikacja** (prevent/grant flying) |
| Heron-Blessed Geist | Flying; ze cmentarza `{3}{W}` + exile: dwa 1/1 Spirit flying; tylko gdy kontrolujesz enchantment; sorcery | **weryfikacja** warunku aktywacji i kosztu z cmentarza (`exileFromGraveyard` istnieje) |
| Ior Ruin Expedition | Landfall → quest counter; remove 3 quest + sacrifice: draw 2 | landfall/quest istnieją; koszt złożony **weryfikacja** |
| Gnoll War Band | Koszt −{1} za każdego przeciwnika, któremu zadano dmg w tej turze; Menace; Myriad | bloodthirst-stan istnieje; warunek kosztu **rozszerzenie**; Myriad **nowe** |
| Gruul Beastmaster | Riot; atak: inny cel +X/+0, X = moc | **riot nowe** (wybór gracza); pump X=moc **weryfikacja** |
| Myr Scrapling | Artifact creature 1/1; sacrifice: +1/+1 counter na cel | istnieje (sacrificeSelf + add_counter) |

Nowe generyczne mechaniki (bez nazw kart): **Convoke** (płatność stworami, CR 702.51), **Riot** (wybór: licznik lub przelotka, CR 702.136), **Myriad** (CR 702.116), **koszt „poświęć dołączonego stwora”**, **warunek redukcji „za każdego przeciwnika z dmg w tej turze”**, **liczniki przy wejściu „if kicked”**.

## Kolejność wdrożenia

1. E0 (ten commit): snapshoty (10), rulingi (wpisane), wiersze CSV, plan.
2. E1 — weryfikacja pozostałych mechanik (trample warunkowy, prevent/grant flying, warunek aktywacji z cmentarza, koszt złożony, pump X=moc). Brakujące doszczelnić jako generyczne.
3. E2 — rozszerzenia małe: `entersWithCountersIf.kicked`, warunek redukcji kosztu za przeciwników z dmg.
4. E3 — koszt „poświęć dołączonego” (Bloodfire).
5. E4 — Riot (wybór przy wejściu, także dla gracza ludzkiego).
6. E5 — Myriad (tokeny kopiowane, tapped and attacking, exile at end of combat; w 1v1 zero tokenów wg rulingu).
7. E6 — Convoke (płatność stworami przy rzucie; bot i gracz).
8. E7 — definicje w `src/cards/card-data.js` i `src/cards/mana-costs-data.js` (`artId` z CSV, `limitations` puste), `test/real-cards-batch69.test.js`, `node tools/generate-plan-decks.mjs`.
9. E8 — dokumentacja (`PROJECT_HISTORY.md`, `ENGINE_MILESTONES.md`), bramy `npm test`, `npm run build`, `npm run test:all` (log do `.arena/`), push. Bez merge, bez push do `main`.

## Kryteria akceptacji

- Każda karta: definicja, testy zachowania (nie tylko istnienia), `limitations` puste.
- Piny generyczne na każdą nową mechanikę (RED przed kodem, GREEN po).
- Golden master i testy regresji bez zmian w zachowaniu istniejących kart (poza zamierzonymi).
- Talie wyłącznie z generatora.
