# ADR 0025: Pełna macierz benchmarku pod budżet meczów, nie pod wszystkie kombinacje

- **Status:** Zaakceptowana
- **Data:** 2026-08-29
- **Decydenci:** właściciel projektu (decyzja w toku sesji M255)
- **Uzupełnia:** [ADR 0018](0018-benchmark-full-only-on-owner-command.md)
  (pełny przebieg nadal wyłącznie na wyraźną komendę — ten ADR zmienia jego
  ROZMIAR, nie zasadę uruchamiania)

## Kontekst

Pełna macierz B0 była zdefiniowana jako „wszystkie pary botów × wszystkie pary
talii × 50 seedów × 2 strony". Przy 12 taliach dawało to 23 400 meczów
(~40 min) i taki szacunek utrwalił się w ADR 0018 oraz w komentarzach
narzędzia. Po podziałach talii (ADR 0024) katalog ma 22 pliki, czyli **253 pary**
— macierz urosła do **75 900 meczów** i nikt tego nie zauważył, bo od miesięcy
nikt nie dograł jej do końca. Właściciel zobaczył to w logu postępu po 63
minutach: ETA 526 minut. Kombinacje rosną z **kwadratem** liczby talii — przy
45 taliach byłoby to ~300 tysięcy meczów.

Wniosek właściciela: *„Mieliśmy losować talie do benchmarku, a nie robić
wszystkie kombinacje"*, z wymaganiem, żeby algorytm **dostosowywał się
dynamicznie do liczby talii** i mieścił uśredniony pomiar w ~10 minutach.

## Decyzja

1. **Rozmiar pełnej macierzy wyznacza BUDŻET MECZÓW** (domyślnie 6 000,
   `--budget N`), nie liczba kombinacji. Kombinacji nie wyczerpujemy — także
   dlatego, że za miesiąc będzie ich znów dwa razy więcej.
2. **Kształt dobiera się do liczby talii** (`resolveMatrixShape`): najpierw
   minimalna liczba seedów na pojedynek (`--min-seeds`, domyślnie 4), potem
   tyle par talii, ile mieści się w budżecie; gdy talii jest mało, nadwyżka
   budżetu idzie w seedy.

   | Talii | Wszystkich par | Granych par | Seedów | Meczów | Czas (~154 ms/mecz) |
   |---|---|---|---|---|---|
   | 6 | 21 | 21 | 47 | ~5 900 | ~15 min |
   | 18 (dziś) | 171 | 171 | 5 | ~5 100 | ~13 min |
   | 45 | 1 035 | 250 | 4 | ~6 000 | ~15 min |
   | 120 | 7 260 | 250 | 4 | ~6 000 | ~15 min |

   Budżet jest w meczach, nie w minutach: rozmiar próbki musi być
   deterministyczny (ADR 0005), a czas zależy jeszcze od maszyny.
3. **Próbka par talii gwarantuje pokrycie** (`sampleDeckPairs`): najpierw rundy
   parowań, w których każda talia dostaje co najmniej dwa pojedynki, potem
   dopełnienie losowymi parami. Żadna talia nie wypada z pomiaru.
4. **Determinizm:** PRNG seedowany (`mulberry32(seedBase)`) — ten sam katalog i
   `seedBase` dają tę samą próbkę.
5. **Jawne `--seeds` przesuwa środek ciężkości** (więcej seedów = mniej par
   talii), ale nigdy nie powiększa macierzy ponad budżet.
6. **Worki nie wchodzą do macierzy** (`benchmarkDecks()`, ADR 0023 §5): pełny
   profil bierze 18 talii jednoplanowych, nie 22 pliki z `decks/`.
7. **Wyczerpująca macierz znika** — nie ma flagi, której nikt nie dogra.
   `BENCH_DECKS` (6 talii) zostaje próbką profilu SZYBKIEGO i testu regresji
   (672 mecze, bez zmian).

## Konsekwencje

### Pozytywne

- Czas pełnego pomiaru jest stały i nie zależy od wzrostu katalogu; każda talia
  jest mierzona, więc tabela per-talia nadal ma sens.
- Martwy szacunek „23 400 / ~40 min" przestaje obowiązywać.

### Koszty i ryzyka

- Przy dużej liczbie talii pojedynek ma tylko 4 seedy — wynik per-para jest
  szumieniem; do porównań służą agregaty (bot, talia).
- Próbka zmienia się wraz z liczbą talii, więc wyniki pełnej macierzy z różnych
  sesji nie są wprost porównywalne — próg regresji nadal bierze się ze stałej
  `REGRESSION_CONFIG`.
- Budżet 6 000 to kompromis; dokładniejszy pomiar per-talia wymaga `--budget`.

## Rozważone alternatywy

- **Wszystkie pary talii, mniej seedów** — pokrycie kombinacji rośnie
  kwadratowo; problem wraca przy 45 taliach.
- **Stała próbka N talii (styl BENCH_DECKS)** — precyzyjna, ale połowa katalogu
  wypada z pomiaru (właściciel: „za miesiąc 45 talii").
- **Wyczerpująca macierz jako osobna flaga** — odrzucone: nikt jej nie dogra,
  a sama obecność flagi kusi.

## Powiązania

- [ADR 0018](0018-benchmark-full-only-on-owner-command.md) — kiedy wolno
  uruchomić pełny przebieg (bez zmian).
- [ADR 0023](0023-decks-per-plan-and-benchmark-sample.md) ·
  [ADR 0024](0024-deck-split-by-colors-and-rotating-benchmark.md) — skąd 22
  talie i rotująca próbka.
- `docs/LESSONS.md` L89 · `test/benchmark-budget-probki.test.js` ·
  `test/benchmark-progress-watchdog.test.js`.
