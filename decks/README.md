# Talie w repozytorium

Talie są wersjonowanymi plikami tekstowymi (ADR 0011, ADR 0012). Format jest
dokładnie tym samym formatem, który kreator talii będzie kopiował i pobierał:

```text
# Nazwa talii

8x Synthetic Mountain
12x Synthetic Razorback
```

Zasady:

- jedna linia na kartę: `<liczba kopii>x <nazwa karty>`;
- nazwa musi odpowiadać definicji z katalogu (`src/cards/card-data.js`);
- talia może odwoływać się wyłącznie do kart o statusie `supported` —
  naruszenie wykrywa test (`test/repo-decks.test.js`), nie dopiero gra;
- limit 4 kopii dla kart niebędących landami podstawowymi; landy podstawowe
  są bez limitu;
- rozmiar talii pierwszego formatu nie jest jeszcze ustalony — obecne talie
  syntetyczne mają 20 kart i służą testom silnika.

## Stan obecny

Pliki `synthetic-*.txt` to talie testowe na syntetycznym katalogu kart
— nie są to realne karty MtG. Służą jako stabilna baza testów engine.

**`real-batch1.txt`** to pierwsza talia na realnych kartach (Batch 1, ADR 0010):
Highland Game (KTK), Kappa Tech-Wrecker (NEO) i Segmented Krotiq (DTK).

**`real-batch2.txt`** to talia Batchu 2: Grizzled Outcasts (ISD, transform DFC),
Entrancing Lyre (THB) i Zoraline, Cosmos Caller (BLB).

Landy to na razie tymczasowo `Synthetic Forest` — prawdziwe landy wejdą
z kolejnym batchem z listy właściciela.
