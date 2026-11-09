# Plan 2026-11-08e — Inspiration: instant-draw na końcówkę tury przeciwnika

## Problem i zakres

Właściciel: „Bot rzuca ją w swojej fazie podtrzymania jak tylko ma manę
z untapu i uniemożliwia sobie rzucenie innych czarów w tej turze. Ta karta
to instant i powinna być rzucana w ostatniej fazie tury przeciwnika za
manę, która i tak za chwilę się odtapuje.”

Nośnik zgłoszenia: **Inspiration** (`inspiration`, Instant {3}{U},
`draw_cards amount:2 applyTo:'target'`). Naprawa ma być **polityką bota po
deskryptorze** (ADR 0002), nie przypadkiem specjalnym po nazwie karty:
czysty instantowy dobór dla siebie, rzucany z ręki, czeka na okno darmowej
many (end step przeciwnika) i nie wydaje many potrzebnej na inny rzucalny
czar w tej turze.

Zakres: `src/controllers/heuristic-bot.js` + parametr w
`src/controllers/heuristic-params.js`. Bez nowych kart katalogu (ADR 0029),
bez pełnego B0 (ADR 0018), bez scalania. PR sesji #184 już otwarty; plan
wypchnięty przed edycją źródeł, każdy przyrost produkcyjny osobno zielony.

## Rozpoznanie przed kodem

- `inspiration` w `src/cards/card-data.js`: `spell.timing='instant'`,
  `effects=[{type:'draw_cards',amount:2,applyTo:'target'}]`,
  `targets=[{type:'player'}]`, `manaCost:4`.
- Bot, gałąź `cast_spell`: `isDrawOnly` startuje od −1; własny odbiorca
  dostaje `P.drawCardValue·2 + drawDeckingPenalty` (w fixture PMSSB3: 11);
  `+P.instantDrawFoeEndBonus` (+10) **tylko** gdy `!myTurn && step==='end'`
  (wynik 21). Brakuje kary za własny upkeep/draw i za wydanie many
  potrzebnej na inny czar — bot rzuca w pierwszym możliwym oknie.
- Istniejące exact piny, których nie wolno złamać bez świadomego uzasadnienia:
  - `test/pmssb3-draw-wave-b.test.js`: Inspiration self main = **11**,
    foe EOT self = **21**, foe EOT foe-target = **−13**; sorcery Reunion
    main1 = main2 = **17** (sorcery-draw nie czeka).
  - `test/znaleziska-a4-triage-slabs-inspiration.test.js`: A4-4/3 main1,
    ręka tylko Inspiration, biblioteka 15/15 → **rzuca w siebie**;
    A4-4/4 biblioteka 5 → **pass** (deck-out).
  - `test/uwaga-village-rites-ofiary-1-1.test.js`: Village Rites ma
    dodatkowy koszt `sacrificeCreature` i własną twardą politykę ofiary 1/1
    — nie wolno zmienić jej okien ani wyceny.
- Wzorzec do naśladowania: `looksAtOwnLibraryOnly` (scry/surveil, M211/A1)
  — instant: foe `end` +10, else −12; sorcery: main2 +6, manaContested −12.
  Rodzina D (K4b/K6) karze własny upkeep/draw dla removalu/tokenów.
- Katalog instantów z doborem: 9 kart, **2 czysto-doborowe** (`inspiration`,
  `village-rites`); Village Rites odpada przez `additionalCost`. Mieszane
  ridery (Curate, Withstand, Lunar Rejection, Chill, Fleeting Distraction,
  Timely Interference) zostają poza klasą — ich okno należy do efektu
  głównego, nie do doboru.

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

Wniosek: premia +10 za EOT wroga istnieje, ale nic nie trzyma karty poza
tym oknem. Bot pali dobór w upkeepie (własnym i przeciwnika) oraz w każdej
innej fazie, zanim mana będzie potrzebna do czarów/odpowiedzi.

## Naprawa (hipoteza do weryfikacji RED→GREEN)

1. Wspólny predykat klasy po deskryptorze: `spell.timing==='instant'`,
   cała treść to `draw_cards` z odbiorcą = bot (celowany `applyTo:'target'
   → cmd.targets[targetIndex]===view.playerId`; niecelowany → bot),
   **bez** `spell.additionalCost` (Village Rites poza klasą) i bez
   mieszanych riderów. Nie obejmuje `draw_cards_both_players` (prezent dla
   wroga), zdolności aktywowanych, triggerów ani darmowych rzutów.
2. Delta okna dla rzutu z ręki (`cast_spell`/`cast_cleave`/`cast_escape`/
   `cast_flashback`/`cast_adventure` — ta sama gałąź wyceny):
   - end step przeciwnika (`!myTurn && step==='end'`): bez kary; istniejące
     `+P.instantDrawFoeEndBonus` zostaje (CR 117.1a, 513.1, 500.5/106.4);
   - własna faza główna (`main1`/`main2`/alias `main`): kara tylko, gdy
     mana jest **kontestowana** — istnieje inna legalna oferta rzutu
     (`UNLOCK_CAST_TYPES`, inny obiekt, koszt > 0), a
     `manaAvailableNow(view) < kosztInspiration + kosztInnegoCzaru`;
   - pozostałe okna (własny upkeep/draw/combat/end, tura przeciwnika poza
     end step): kara `P.instantDrawHoldPenalty` (120, skala rodziny D —
     przebija bazę/dobór, ×0 = zachowanie sprzed zgłoszenia).
3. Parametr `instantDrawHoldPenalty` w `HEURISTIC_PARAM_KEYS` +
   `DEFAULT_HEURISTIC_PARAMS`, z komentarzem klasy i anty-over-fix.
4. Bez zmian w `activate_ability`, `resolve_optional_trigger_choice`,
   `freeCast*` — L41 świadomie: zdolności/darmowe rzuty nie płacą kosztu
   opportunities z ręki, a ich exact piny (scholar 4/14, scroll 6) zostają.

## Kryteria ukończenia

- [ ] Piny ID/1–ID/12 RED przed fixem, GREEN po (własny upkeep/draw hold,
      upkeep/main przeciwnika hold, foe EOT cast, main bez konkurencji 11,
      main z konkurencją hold, sorcery Reunion 17, foe-target −13,
      deck-out lib5 pass, Village Rites bez zmian, Curate/mixed bez zmian,
      ability/free-trigger bez zmian, pełny execute upkeep→pass→main→cast).
- [ ] Mutacje mID1–mID5 wyłączają konkretne piny na końcowym kodzie;
      źródło przywrócone bitowo.
- [ ] Stare piny PMSSB3/A4/Village Rites/PMSSB8/PMSSB32 zielone w plikach
      celowanych.
- [ ] Pełny szybki rdzeń + build, commit + push; finalnie `npm run test:all`
      zielone, golden-master bez regeneracji (Inspiration występuje tylko
      w `decks/wiedzmin-wur.txt`, poza parami snapshotu).
- [ ] Historia/handoff/raport/PR #184 opisane; bez scalania.

## Ryzyka i pułapki

- **L181**: pin „main = 11” broni dobrowolnego rzutu w mainie przy pustej
  konkurencji — nie łamać go szeroką karą za własną mainę. Kara w mainie
  wyłącznie przy realnym konflikcie many.
- **L41**: nie kopiować logiki okna do zdolności/triggerów; wspólny helper
  tylko tam, gdzie ten sam koszt opportunities (rzut z ręki).
- **L183**: kara okna ma wyzerować wycenę, nie „przebijać” bazę w sposób
  zależny od wielkości doboru; 120 jak rodzina D.
- **L176**: golden-master tylko `--dump` przy dryfie; bez `--write`.
- Village Rites: `additionalCost` wyklucza z klasy; nie ruszać polityki
  ofiary 1/1 ani exact pinów V/produkcja.
- CR: świeże literały z `.arena/cr-current.txt` (2026-11-06, SHA-256
  `d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`):
  117.1a (instant w każdym priorytecie), 106.4/500.5 (pula próżnieje na
  końcu kroku/fazy), 502.3 (untap), 503.1 (upkeep), 513.1 (end step),
  514.3 (cleanup bez priorytetu), 307.1 (sorcery we własnej mainie),
  121.4 (deck-out).

## Kolejność commitów

1. Plan (ten plik) — commit + push **przed** edycją źródeł; aktualizacja
   tytułu/opisu PR #184 (REST, `gh pr edit` uszkodzony przez projectCards).
2. Piny RED + fix + parametr — pełny szybki rdzeń + build, commit + push.
3. Mutacje/anty-over-fix — jeśli osobny przyrost, pełna brama + push.
4. Dokumentacja finalna (raport, historia, handoff, plan [x]) + PR PATCH.
