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

**`real-batch3.txt`** to talia Batchu 3: Rupture Spire (CON, ETB tapped + „sacrifice
unless you pay"), Leafcrown Dryad (THS, enchantment creature z reach i PEŁNYM
bestow {3}{G}) i Prismari Campus (STX, ETB tapped + {4},{T}: Scry 1).

**`real-batch4.txt`** to talia Batchu 4: Gloomfang Mauler (MOM, menace + backup 2
+ swampcycling {2}), Serra's Embrace (DVD, czysta aura +2/+2, flying, vigilance)
i Cloak of the Bat (CLB, equipment: equip {2}, flying + haste nosiciela). Landy
podstawowe to wpisane wprost `Swamp`/`Synthetic Mountain` — prawdziwe basicy są
w rejestrze (`VIRTUAL_BASIC_LANDS` w `src/cards/card-data.js`), więc walidacja
honoruje je bez limitu kopii, a swampcycling ma realny cel wyszukiwania.

Decyzja właściciela (2026-08-01): prawdziwe landy podstawowe **nie są osobnymi
kartami z ilustracjami w UI** — istnieją wirtualnie (do talii dobiera się dowolną
liczbę sztuk). Wymiar mechaniczny jest już wdrożony (rejestr + talie); wymiar
wizualny (ilustracje ze Scryfall jak w pliku legacy HTML) to osobne zadanie.
