# Plan PMSSB-24 — filtrowanie wierzchu biblioteki (`scry` + `surveil`)

Data: 2026-09-30 · sesja: 2026-09-30a · metoda: M429 (audyt przyczynowo-skutkowy
JEDNEJ rodziny + fale + piny; NIE tuning maszynowy, ADR 0018)
Hub: `docs/PMSSB.md` · precedens procedury: PMSSB-23 (`PLAN_2026-09-29e-pmssb23-liczniki.md`)

## Zlecenie i wybór rodziny

Właściciel: „bierz się za kolejne fale PMSSB aż do wyczerpania budżetu sesji".
Rodzinę wybrał pomiar katalogu, nie przeczucie (skrypt `/tmp/inv2.mjs`,
583 karty, 184 typy efektów, 673 wystąpienia): `scry` = **12 kart**, `surveil`
= **5 kart**, a w rejestrze PMSSB nie ma ani jednego wiersza dla tej rodziny.
Wcześniejsze dotknięcia to łatki punktowe (M135 wspólna miara karty, M148
permutacje w silniku, M211/A1 i M218/4 okno czaru, K 2026-09-22 Titan's
Strength) — więc jest to **pierwsza pętla PMSSB** dla rodziny, z nowym dowodem
(sonda niżej), a nie re-audyt zamkniętej.

## Inwentarz (sonda `/tmp/inv-scry.mjs`)

20 kart z instrukcją układania własnej biblioteki; 17 z `scry`/`surveil`:

| Okno | Karty |
|---|---|
| czar (rider) | `titans-strength` {1} (pump+scry 1), `expose-to-daylight` {3} (destroy+scry 1), `inspire-awe` {4} (prewencja+scry 2), `rage-of-purphoros` {5} (damage 4+scry 1), `curate`/`curate-stx` {2} (surveil 2+draw 1), `vanish-from-sight` {4} (bounce+surveil 1) |
| zdolność aktywowana | `prismari-campus` (scry 1), `seers-lantern` (scry 1), `survivor-of-korlis` (scry 2), `kishla-village` (surveil 2) |
| trigger ETB | `trained-arynx` (scry 1), `nefarious-imp` (scry 1, tura wroga), `omenspeaker` (scry 2), `merfolk-falconer` (scry 2), `sifter-wurm` (scry 3 **+ reveal wierzchu + życie = mana value**), `etherwrought-page` (surveil 1) |
| rodzeństwo | `blanchwood-prowler`/`satyr-wayfinder` (`reveal_top_pick_land_rest_grave`), `chittering-rats` (`opponent_hand_card_to_top`), clash (1 karta) |

Ścieżki decyzyjne: `resolve_scry` (podzbiór na spód × permutacja reszty,
`game-state.js:7149-7160`), `resolve_surveil` (podzbiór do grobu × permutacja),
`resolve_clash_choice`, `resolve_library_placement`. Wycena ridera:
`ETB_EFFECT_BONUS.scry = () => 4` (płasko, bez `amount`), modal `+3`,
w czarze okno M218/4 (czysty −60/+6…+10, mieszany −12).

## POMIAR PRZED (sonda `/home/user/scratch/pmssb24-scry-przed.mjs`, `/tmp/p8.mjs`)

| # | Scenariusz | Wynik | Wniosek |
|---|---|---|---|
| P1 | scry 2, wierzch [{5} czar, {2} stwór 2/1], obie karty zostają | obie permutacje = **20 / 20** | kolejność nie rozstrzyga → **F1** |
| P2 | surveil 2, kolejność oryginalna vs odwrócona | **21 vs 20** | bonus `keepsOrder` premiuje oryginalną — lepsza kolejność NIGDY nie wygra → **F1** |
| P3 | odłożenie zbędnego landu, biblioteka 2 karty vs 12 | **26 = 26** | SCRY nie zmienia liczby kart — wynik POPRAWNY (korekta F2) |
| P4 | surveil: zmielenie zbędnego landu, delve w ręce vs bez | **25 = 25** | grób jako zasób niewidoczny (CR 701.25) → **F3** |
| P5 | ręka pusta vs 4 karty, te same karty na wierzchu | **12/12 = 12/12** | kontekst ręki (topdeck/duplikaty) niewidoczny → **F4** |
| P8 | `sifter-wurm` scry 3 + `revealTopGainLife`; wierzch [{5}, {2}, land] | najlepszy wariant bota = **`bottom:t0` (23)**, czyli odkłada kartę {5}; 6 permutacji keep-all = 20 (remis); `pendingScry` w widoku = `playerId`/`count`/`cards` | reveal nie istnieje dla bota → **F5**; bot odkłada DOKŁADNIE tę kartę, którą reveal chciał na wierzchu (5 życia → 2) |
| P6 | `titans-strength` na własnym 2/2: main1 / main2 / end / declare_blockers (tura wroga) | **−35 / −35 / −20 / −35** | kotwica M218/4 + K — NIE ruszać (okno czaru mieszanego należy do efektu głównego) |
| P7 | scry 1/2/3, trzy zbędne landy: odłóż wszystkie vs keep | **26 / 32 / 38** vs 20 | decyzja skaluje się z liczbą kart poprawnie — kotwica anty-over-fix |

## Findingi

- **F1 (klasa L50/L41): kolejność kart na wierzchu nie jest wyceniana.**
  Silnik oferuje permutacje (`topOrder`, CR 701.22a „the rest on top of your
  library in any order"; przy surveil CR 701.25), a `resolve_scry` liczy tylko
  `bottomIds` — permutacje remisują i wybór pada na pierwszą z listy. Przy
  surveil jest gorzej: `keepsOrder ? 1 : 0` daje punkt za kolejność ORYGINALNĄ,
  więc świadome ułożenie jest karane. Skutek uboczny: etykieta diagnostyczna
  (`describeCommand`) nie koduje `topOrder` — 16 wariantów scry ma 8 etykiet,
  więc tie-audit raportuje remisy tam, gdzie są różne decyzje.
- **F2 — KOREKTA własnego findingu (L92): deck-out dotyczy SURVEIL, nie scry.**
  Plan twierdził, że odłożenie karty na spód odsuwa deck-out. To nieprawda:
  scry przekłada kartę w obrębie TEJ SAMEJ biblioteki (CR 701.22a — „karta na
  spodzie biblioteki to ten sam obiekt w tej samej strefie", jak mówi komentarz
  silnika), więc liczba kart się nie zmienia i pomiar P3 (26 = 26) jest
  POPRAWNYM zachowaniem, nie usterką. Deck-out (CR 121.4/704.5b) wchodzi
  dopiero przy surveil, bo tam karta idzie do GROBU (CR 701.25) i biblioteka
  realnie chudnie. Pomiar (`/tmp/f2.mjs`): biblioteka 2 karty —
  `resolve_surveil(mill:t0)` = **24**, dokładnie tyle, co przy 12 kartach;
  `resolve_surveil` nie ma ŻADNEJ drabiny presji (tylko stały `MILL_CAUTION`),
  a mieląc ostatnie karty bot przegrywa partię o jedno dobranie wcześniej.
- **F3: surveil ≠ scry semantycznie.** Karta idzie do GROBU (CR 701.25), a grób
  jest zasobem: `delve` (`hooting-mandrills` w katalogu), delirium, reanimacja,
  `resolve_grave_free_cast`. Dziś jedyna różnica to stały `MILL_CAUTION = 2`
  (pomiar P4: 25 = 25 z delve w ręce i bez).
- **F4: wartość karty nie zna ręki.** Przy pustej ręce najbliższa karta to
  wszystko, co mamy (topdeck); przy czwartej kopii tej samej karty kolejna jest
  prawie bezwartościowa. Dziś obie sytuacje dają tę samą liczbę (P5).
- **F5 (brak danych — klasa L1): `revealTopGainLife` nie dociera do widoku.**
  Sifter Wurm: „scry 3, then reveal the top card of your library. You gain
  life equal to that card's mana value" — reveal następuje PO decyzji gracza
  (`game-state.js:2263`, CR 608.2), więc kolejność wierzchu steruje zyskiem
  życia, a bot o tym nie wie. Pomiar: najlepszy wariant = odłożenie karty {5}.

## Fale

- **Fala A — kolejność (F1).** Wspólny helper `libraryOrderValue(view, karty)`
  liczący sumę zdyskontowaną: karta pierwsza na wierzchu jest dobierana
  najbliższym drawem (pełna wartość), kolejne z dyskontem; usunięcie bonusu za
  kolejność oryginalną w surveil (porównanie permutacji, nie preferencja);
  etykieta diagnostyczna kodująca `topOrder`. Kotwica: wartości przy
  podzbiorze odłożonym BEZ zmian (P3/P7).
- **Fala B — dane i presja (F5 + F2 po korekcie).** `pendingScry
  .revealTopGainLife` w `playerView` (warunkowe pole → wpis na liście wyjątków
  kontraktu m277, L113) + dopłata za kartę o wysokiej mana value na wierzchu
  (życie = mana value, pomiar: bot odkładał {5} na spód, czyli 5 życia → 2);
  wspólna drabina deck-outu (`drawDeckingPenalty`, L41) przy mieleniu surveil.
- **Fala C — kontekst (F4 + F3).** Mnożnik pilności przy pustej/niskiej ręce,
  dyskonto duplikatów w `cardKeepValue`; premia za mielenie przy surveil, gdy
  grób jest zasobem (delve w ręce), przy zachowaniu `MILL_CAUTION` jako bazy.

Każda fala: piny + mutacja (dokładnie jeden oczekiwany RED) + `npm test` +
`npm run build` + push. Pokrętła `scry*`/`surveil*` w `heuristic-params.js`
tak, żeby ×0 przywracało wartość z poprzedniej fali (anty-over-fix M429).

## Bramy

`npm test` fast, `npm run build`, na końcu `npm run test:all` (golden-master
BEZ regeneracji fixture'a), `node tools/bot-tie-audit.mjs --gry=40` PRZED/PO,
`node tools/cr-numery.mjs`, budżet lektury `test/dokumentacja-budzet-lektury`.
Raport w `docs/PMSSB.md` (sekcja + wiersz rejestru), wpis w
`docs/PROJECT_HISTORY.md`, handoff `docs/setup/HANDOFF_2026-09-30a.md`.
