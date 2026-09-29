# PLAN 2026-09-29 — PMSSB-19: search_library (tutory) — rider w cast/aktywacji + Final Parting

**Cel rodziny**: `search_library_*` (CR 701.23b — search/shuffle) — 11 kart:
ETB-tutory (kor-cartographer, pilgrims-eye, fierce-empath), aktywacje
(dawntreader-elk, horizon-spellbomb, angels-herald), czary
(final-parting, call-the-mountain-chocobo, exploding-borders,
prishes-wanderings, greater-tanuki/channel). Silnik ma 3 typy efektów:
`search_library_to_battlefield`, `search_library_to_hand`,
`search_library_two_cards_hand_and_grave` (Final Parting).

## Audyt przyczynowo-skutkowy

### R1 — rider 0 w cast_spell i activate_ability (L41)
Płaskie wartości 9/10 żyją TYLKO w tabeli ETB (`etbEnterBonusValue`) —
czary i aktywacje nie widzą zysku z szukania. Pomiary PRZED: S01 Final
Parting = 50 (sama baza — 2-kartowy tutor warty 0!), S06b aktywacja Elka
= −124 (bot nigdy nie poświęci stwora po ląd — payoff 0). Unifikacja:
`searchRiderValue(view, effect)` wywoływany z trzech ścieżek (tabela ETB,
pętla cast, pętla aktywacji) — wzorzec `proliferateTargetValue` (L41).

### R2 — `search_library_two_cards_hand_and_grave` = 0 WSZĘDZIE
Final Parting („two cards. One into your hand and the other into your
graveyard") — najmocniejszy tutor puli (dowolne 2 karty!) nie ma:
wartości ridera, wpisu w tabeli ETB, ANI wpisu w `LIBRARY_SEARCH_EFFECTS`
(deck-out — C zgłoszenie Elka: karta opuszcza bibliotekę bezpowrotnie;
tu AŻ 2 karty). Model: `searchTwoCardsValue (16)` = 9 (najlepsza karta do
ręki) + 7 (połowa grobowa = setup reanimacji; moduł reanimacji osobno) +
kwota 2 w karze bibliotecznej.

### R3 — połowa „do ręki" jest silniejsza niż losowe dobranie
Tutor daje NAJLEPSZĄ kartę kategorii (nie losową — drawCardValue 6):
baza `searchToHandBase (9)` = 6 + premia selekcji. Ląd do ręki przy
**manascrew** (moje lądy < 3) = odbraniczanie gry — `searchLandScrewBonus
(5)` (stan gry; najczęstsza przyczyna przegranej). Połowa „na planszę" =
trwały ramp: `searchToBattlefieldBase (10)` (stara ETB — bez zmian).

### R4 — wybór karty zostaje jak jest
`resolve_search_choice` (25 + 30 za ląd + statystyki + domain) wyceniony
(„Temat 6" + zgłoszenie B: found > fail-to-find) — nie ruszamy.

## Model (4 pokrętła)
`searchRiderValue(view, effect)`:
- `search_library_to_battlefield[_tapped]` → `searchToBattlefieldBase (10)`;
- `search_library_to_hand` → `searchToHandBase (9)` + `searchLandScrewBonus
  (5)` gdy ląd i moje lądy < 3;
- `search_library_two_cards_hand_and_grave` → `searchTwoCardsValue (16)`.
`LIBRARY_SEARCH_EFFECTS` += two_cards (kwota 2).

## Kotwice (POMIAR PRZED → PO; biblioteka 24 = brak kary cienkiej)
| | PRZED | PO |
|---|---|---|
| S01 final-parting | 50 | 66 |
| S01b final-parting, bibl. 10 | 50 | −66 (guard deck-outu: −132) |
| S03 chocobo (0 lądów) | 69,96 | 83,96 (+9+5) |
| S04 kor (ETB, na planszę) | 72,9009 | 72,9009 (baza bez zmian) |
| S05 empath (ETB, do ręki, nie ląd) | 70,1991 | 70,1991 (bez zmian) |
| S06b elk activate | 2 | 12 (+10) |

Pomiar: `/tmp/pmssb19-search-przed.mjs` (uwaga: wersja z 10-kartową
biblioteką kary `libraryLossPenalty` zniekształca — stąd −66/−114).
