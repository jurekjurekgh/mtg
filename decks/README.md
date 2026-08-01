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
— nie są to realne karty MtG. Zostaną zastąpione lub uzupełnione taliami
z pierwszej listy kart właściciela (ADR 0010).
