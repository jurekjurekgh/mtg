# PLAN 2026-10-20e — PMSSB-71: riot (tryb modalny przy wejściu)

Mechanika: Riot („wchodzi z +1/+1 albo z haste — wybór gracza”). W silniku to modalny
trigger `enter_battlefield` z dwoma trybami: `add_counter +1/+1` i `grant_keyword_permanent haste`.
Karta w danych: Gruul Beastmaster (`gruul-beastmaster`, batch 69). Jedyna karta z trybami riot.

## Pomiar PRZED (`.arena/probe-riot.mjs`, prawdziwy silnik, `resolve_modal_choice`)

Scena: Beastmaster rzucony z ręki (4 many), oczekujący modalny trigger, wycena trybów przez
`createHeuristicBot().chooseCommand`. Wynik na `3840894`:

| scena                              | tryb 0 (licznik) | tryb 1 (haste) | wybór |
|------------------------------------|------------------|----------------|-------|
| pusta plansza, życie wroga 20      | 15               | 10             | 0     |
| + nasz 2/2 (może atakować), życie 20 | 15             | 10             | 0     |
| + nasz 2/2, życie wroga 4 (LETAL)  | 15               | 10             | 0     |
| + wróg 4/4 blokuje, życie 20       | 15               | 10             | 0     |
| + wróg 1/1 blokuje, życie 20       | 15               | 10             | 0     |

Przyczyny (kod, nie zgadywanie):
- tryb 0: `ETB_EFFECT_BONUS.add_counter` bez celu = stała 5 (10 + 5 = 15);
- tryb 1: `grant_keyword_permanent` nie ma wpisu w `ETB_EFFECT_BONUS` = 0 (10 + 0).

Defekt: w scenie z LETALEM (atak Beastmastera 2 + pompa +2 na drugiego stwora = 6 ≥ 4)
bot i tak wybiera licznik, który w tej turze nic nie daje. Ta sama karta rzucona bez riotu
(zwykłe słowo `haste`) dostaje z `creatureKeywordValue` `creatureKwHaste × moc/ref` = 6 × 2/3 = 4.
Tryb riot wycenia to samo słowo na 0: wycena niezgodna z L41.

## Audyt (kontrole obowiązkowe)

(a) L41 — wspólna miara: tryb haste = `creatureKeywordValue(view, {keywords:['haste'], power}, source)`,
    czyli ta sama funkcja, co rzut stworzenia z tym słowem. Tryb licznika = wartość ciała +1/+1
    (`creaturePowerWeight·1 + creatureToughnessWeight·1` = 3), czyli ta sama miara P/T co
    `creatureBase` i wycena mocy w rzucie. Zmiana tylko w gałęzi `modalModeValue` (tryby modalne),
    NIE w globalnej stałej `add_counter` = 5 (ścieżka ETB bez trybów, współdzielona przez wiele kart).
(b) Wymiar kosztu czaru: bez zmian (koszt riotu bez zmian; wycena trybu nie zmienia kosztu).
(c) Anty-over-fix: (1) bez trybu haste (słowo 0 przez pokrętło `creatureKwHaste = 0`) bot wraca do
    licznika; (2) bez wroga na planszy i bez własnych stworzeń pośpiech nie daje ataku — wartość
    ma pozostać tempem, nie zabójstwem; (3) inne tryby modalne (kontra, dobicie, zysk życia)
    nie zmieniają się — zmiana dotyka tylko `grant_keyword_permanent` i `add_counter` bez celu
    z `+1/+1`.

## Wdrożenie

- `src/controllers/heuristic-bot.js` → `modalModeValue`: dwie gałęzie (haste przez
  `creatureKeywordValue`; licznik `+1/+1` bez celu przez wartość ciała).
- `src/controllers/heuristic-params.js`: bez nowych pokręteł — używa `creatureKwHaste`,
  `creaturePowerWeight`, `creatureToughnessWeight`.

## Testy

- `test/audyt-pmssb71-riot.test.js` (RED→GREEN): letal → haste; parytet L41 (wynik trybu haste =
  10 + wartość słowa); pokrętło `creatureKwHaste=0` → licznik; pin „bez skutku haste” (brak wroga,
  brak atakujących) zgodny z pomiarem; mutacja gałęzi haste wykrywana.

## Ewaluacja

Golden master (cel: bez regeneracji), tie-audit, mirror-eval min. 24 seedy (sparowane A/B),
Żywy Tester. Wynik zanotować w `PROJECT_HISTORY.md` i w hubie PMSSB.
