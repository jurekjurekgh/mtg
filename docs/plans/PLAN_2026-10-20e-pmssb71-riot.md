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

## Pomiar PRZED — odkrycie w trakcie (F0: NaN zrywa wycenę rzutu)

Sonda `.arena/pmssb71-legal.mjs` i `.arena/pmssb71-score.mjs` (sym. gra, `ravnica-rg` vs `ravnica-wub`,
seedy 5000+): Beastmaster jest w ręce i LEGALNY do rzutu w 87 krokach (przy ≥4 lądach), a bot nigdy go
nie wybiera. Wycena rzutu: `cast_permanent(gruul)=NaN` — także na bazie `a1c0576` (pre-existing).

Przyczyna (bisekcja w kopii `/tmp/dbg`, nie w drzewie): `anticipatedAttacksValue` → ETB_EFFECT_BONUS.`pump`
czyta `e.power ?? 0` — dla triggera ataku Beastmastera to tekst `'source_power'` → `'source_power' * 2 = NaN`.
NaN przechodzi przez `score +=` i zrywa całą wycenę rzutu. Zasięg: jedyny wyzwalacz z pompą dynamiczną
w katalogu (grep `source_power` w `card-data.js`: 523 buff_land_creatures, 4798 Beastmaster, typ inny).

Dlatego pomiar z trybami riot (tabela wyżej) NIE pokazywał wpływu na wybór rzutu: wybór trybu jest
poprawny, ale do wyboru trybu bot nigdy nie dochodzi. Kolejność prac: F0 (NaN) → F1 (haste) → F2 (licznik).

Audyt F0: (a) L41 — wszystkie wyzwalacze `attacks`/ETB z pompą P/T przechodzą tę samą drabinę `pump`
    (liczba i deskryptor); (b) bez zmian kosztu; (c) anty-over-fix: pompy LICZBOWE dają tę samą wartość
    (pin), tylko deskryptor `source_power` zyskuje wartość źródła; nierozpoznany deskryptor = 0 (nie NaN).

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

## Wynik

Zamknięte 2026-10-20: F0 (NaN `source_power`), F1 (haste = słowo), F2 (licznik = ciało). Pełne wyniki i otwarte punkty: `docs/PMSSB.md` §PMSSB-71. Bramy: `test:all` 8839/8839, build 0, golden bez zmian, tie-audit bez zmian, A/B 480 partii (rg vs inna talia 93 → 130; McNemar χ² = 23,6), Żywy Tester 3/3 bez zgłoszeń.
