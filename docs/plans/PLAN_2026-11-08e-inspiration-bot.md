# Plan 2026-11-08e — Inspiration: instant-draw na końcówkę tury przeciwnika

## Problem i zakres

Właściciel: „Bot rzuca ją w swojej fazie podtrzymania jak tylko ma manę
z untapu i uniemożliwia sobie rzucenie innych czarów w tej turze. Ta karta
to instant i powinna być rzucana w ostatniej fazie tury przeciwnika za
manę, która i tak za chwilę się odtapuje.”

Nośnik zgłoszenia: **Inspiration** (`inspiration`, Instant {3}{U},
`draw_cards amount:2 applyTo:'target'`). Naprawa jest **polityką bota po
deskryptorze** (ADR 0002), nie przypadkiem specjalnym po nazwie karty:
czysty instantowy dobór dla siebie, rzucany z ręki, czeka na okno darmowej
many (end step przeciwnika) i nie wydaje many potrzebnej na inny rzucalny
czar w tej turze.

Zakres: `src/controllers/heuristic-bot.js` + parametr w
`src/controllers/heuristic-params.js`. Bez nowych kart katalogu (ADR 0029),
bez pełnego B0 (ADR 0018), bez scalania. PR sesji #184 już otwarty; plan
wypchnięty przed edycją źródeł (`0bd187b`), przyrost produkcyjny osobno
zielony (`49f9a30`).

## Rozpoznanie przed kodem

- `inspiration` w `src/cards/card-data.js`: `spell.timing='instant'`,
  `effects=[{type:'draw_cards',amount:2,applyTo:'target'}]`,
  `targets=[{type:'player'}]`, `manaCost:4`.
- Bot, gałąź `cast_spell`: `isDrawOnly` startuje od −1; własny odbiorca
  dostaje `P.drawCardValue·2 + drawDeckingPenalty` (w fixture PMSSB3: 11);
  `+P.instantDrawFoeEndBonus` (+10) **tylko** gdy `!myTurn && step==='end'`
  (wynik 21). Brakowało kary za własny upkeep/draw i za wydanie many
  potrzebnej na inny czar — bot rzucał w pierwszym możliwym oknie.
- Istniejące exact piny:
  - `test/pmssb3-draw-wave-b.test.js`: Inspiration self main = **11**,
    foe EOT self = **21**, foe EOT foe-target = **−13**; sorcery Reunion
    main1 = main2 = **17**.
  - `test/znaleziska-a4-triage-slabs-inspiration.test.js`: A4-4/3 main1,
    ręka tylko Inspiration, biblioteka 15/15 → **rzuca w siebie**;
    A4-4/4 biblioteka 5 → **pass**.
  - `test/uwaga-village-rites-ofiary-1-1.test.js`: Village Rites ma
    `additionalCost.sacrificeCreature` i własną politykę ofiary 1/1.
- Wzorzec: `looksAtOwnLibraryOnly` (M211/A1) i rodzina D (K4b/K6).
- Katalog instantów z doborem: 9 kart, **2 czysto-doborowe** (`inspiration`,
  `village-rites`); Village Rites odpada przez `additionalCost`. Mieszane
  ridery (Curate, Withstand, Lunar Rejection, Chill, Fleeting Distraction,
  Timely Interference) zostają poza klasą.

### Sonda `.arena/probe-inspiration.mjs` (przed fixem)

| Scenariusz | Wybór bota | Inspiration self |
|---|---|---|
| A własny upkeep + inny czar w ręce | `cast_spell(ins->p1)` | 11 |
| B własny main1, tylko Inspiration | `cast_spell(ins->p1)` | 11 |
| C end step przeciwnika | `cast_spell(ins->p1)` | 21 |
| D upkeep przeciwnika | `cast_spell(ins->p1)` | 11 |
| E własny end step | `cast_spell(ins->p1)` | 11 |
| F własny upkeep, pula 4U | `cast_spell(ins->p1)` | 11 |
| G własny main1 + Armored Skaab | `cast_permanent(big)` | 11 (nadal dodatnie) |
| H main1 przeciwnika | `cast_spell(ins->p1)` | 11 |
| I własny main2, tylko Inspiration | `cast_spell(ins->p1)` | 11 |

## Naprawa (wykonana)

1. `isPureInstantSelfDraw`: `spell.timing==='instant'`, cała treść wariantu
   to `draw_cards` z odbiorcą = bot (celowany `applyTo:'target' →
   cmd.targets[targetIndex]===view.playerId`; niecelowany → bot), **bez**
   `spell.additionalCost` i bez mieszanych riderów. `draw_cards_both_players`
   poza klasą. Zdolności aktywowane, triggery i darmowe rzuty poza klasą.
2. `instantDrawHoldDelta` w gałęzi `cast_spell`/`cast_cleave`/`cast_escape`/
   `cast_flashback`/`cast_adventure`:
   - end step przeciwnika: bez kary; istniejące `+P.instantDrawFoeEndBonus`
     zostaje (CR 117.1a, 513.1, 500.5/106.4, 502.3);
   - własna faza główna: kara tylko przy **kontestowanej manie** — inna
     legalna oferta rzutu (`UNLOCK_CAST_TYPES`, inny obiekt, koszt > 0) i
     `manaAvailableNow < kosztDoboru + kosztInnegoCzaru`;
   - pozostałe okna: `−P.instantDrawHoldPenalty` (120, skala rodziny D).
3. Parametr `instantDrawHoldPenalty` w `HEURISTIC_PARAM_KEYS` +
   `DEFAULT_HEURISTIC_PARAMS` (×0 = zachowanie sprzed zgłoszenia).
4. Bez zmian w `activate_ability`, `resolve_optional_trigger_choice`,
   `freeCast*` (L41: inny koszt opportunities; piny scholar 4/14, scroll 6,
   PMSSB-58 loot zostają).

## Kryteria ukończenia

- [x] Piny ID/1–ID/16 RED przed fixem (7 fail), GREEN po; kontrola
      anty-over-fix (PMSSB3/A4/Village Rites/Curate/Scholar/Reunion/deck-out)
      zielona przed i po.
- [x] Mutacje mID1–mID6 RED na konkretnych pinach; źródło przywrócone
      bitowo (`sha256sum -c`).
- [x] Stare piny PMSSB3/A4/Village Rites/PMSSB8/PMSSB32/PMSSB58 zielone
      w plikach celowanych (121/121 w `.arena/id-targeted3.log`).
- [x] Pełny szybki rdzeń **10181/10181** + build **78 / 5813,9 kB**,
      commit `49f9a30` + push; finalnie `npm run test:all`
      **10450/10450, fail 0, 0 skipped** (~673 s), golden-master bez
      regeneracji (fixture nietknięty).
- [x] Historia/handoff/raport/PR #184 opisane; bez scalania.

## Wykonanie

- Commity: `0bd187b` (plan), `49f9a30` (fix + piny ID + CR 513.1 +
  aktualizacja nośnika PMSSB-58), dokumentacja finalna.
- RED: `.arena/id-red.log` — 7/16 fail (ID/1, ID/2, ID/3, ID/4, ID/7,
  ID/15, ID/16); kontrole GREEN.
- Pierwsza pełna brama szybka RED 6: PMSSB-58 A16/A17 (5) + CR-numery (1).
  - **PMSSB-58 A16/A17/A18**: nośnik „biblioteczny instant rzucalny w
    walce” zmieniony z Inspiration na syntetyk `surveil+draw` (mieszany
    rider, poza klasą hold). L181: pin cementował zachowanie zgłoszone
    (Inspiration rzucane w walce); exact piny mana-sacrifice zostały
    (OFF +6, lethal <0, kontrole A17 >0). Inspiration w tej scenie jest
    odtąd poprawnie trzymane do EOT, więc nie może być nośnikiem odblokowania.
  - **CR 513.1**: literał zweryfikowany w `.arena/cr-current.txt`
    (2026-11-06, SHA `d7cdcc11…`), dopisany do tabeli przez
    `node tools/cr-numery.mjs --zapisz --cr .arena/cr-current.txt`
    (575→576 numerów, tabela nie maleje).
- GREEN: `.arena/id-targeted3.log` 121/121; `.arena/id-fast-2.log`
  10181/10181; `.arena/id-build.log` 78 / 5813,9 kB;
  `.arena/id-test-all.log` **10450/10450, fail 0, 0 skipped**.
- Mutacje: `.arena/mut-id-mID1…mID6.log` — mID1 (hold off) → 7 fail;
  mID2 (brak wyjątku EOT) → ID/5+ID/15; mID3 (kara w main bez konkurencji)
  → ID/6+ID/8; mID4 (brak rezerwy many) → ID/7; mID5 (additionalCost w
  klasie) → ID/12; mID6 (ridery w klasie) → ID/13.
- Golden-master: `test/bot-scoring-snapshot.test.js` 4/4 w `test:all`,
  fixture bez zmian (Inspiration tylko w `decks/wiedzmin-wur.txt`, poza
  parami snapshotu i BENCH_DECKS).
- Strażnicy dokumentacji/CR/card-agnostic: **60/60**
  (`.arena/id-docs-guards.log`).
- CR: mirror `nwgarne/mtg-data` 2026-11-06, SHA-256
  `d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`;
  `cr-numery` OK. Raport:
  `docs/audits/ZGLOSZENIE_INSPIRATION_INSTANT_DRAW_2026-11-08.md`.

## Ryzyka i pułapki (zamknięte)

- **L181**: pin „main = 11” obroniony — kara w mainie wyłącznie przy
  realnym konflikcie many; PMSSB-58 nośnik zaktualizowany świadomie.
- **L41**: wspólny helper tylko w gałęzi rzutu z ręki; zdolności/triggery/
  darmowe rzuty bez zmian.
- **L183**: kara 120 przebija bazę/dobór, nie zależy od liczby kart.
- **L176**: golden-master bez `--write`; fixture nietknięty.
- Village Rites/Curate/Scholar/Reunion/deck-out: exact piny zielone.
