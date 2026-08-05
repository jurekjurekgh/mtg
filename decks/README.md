# Talie w repozytorium

Talie są wersjonowanymi plikami tekstowymi (ADR 0011, ADR 0012). Format jest
dokładnie tym samym formatem, który kreator talii kopiuje i pobiera:

```text
# Nazwa talii

1x Highland Game
1x Woolly Loxodon
11x Forest
```

## Zasady (paradygmat singleton, decyzja właściciela 2026-08-04)

- jedna linia na kartę: `<liczba kopii>x <nazwa karty>`;
- nazwa musi odpowiadać definicji z katalogu (`src/cards/card-data.js`);
- talia może odwoływać się wyłącznie do kart o statusie `supported` —
  naruszenie wykrywa test (`test/repo-decks.test.js`), nie dopiero gra;
- **singleton**: każda karta (poza landem podstawowym) max **1 kopia**;
  **lądy podstawowe bez limitu** (ich liczba jest dowolna, dopasowana do talii);
- **minimum 15 kart nielandowych** w talii (lądy podstawowe się nie liczą).

Walidację wymusza `validateDeck` (`src/cards/deck-validation.js`) — domyślnie
`maxCopies=1`, `minNonland=15`. Format tekstowy i round-trip pilnuje
`test/repo-decks.test.js`.

## Bieżące talie (6, hybryda: 3 kolor + 3 plan)

- `green.txt`, `black.txt`, `red.txt` — talie mono-kolorowe (G/B/R) + karty
  bezbarwne/wielokolorowe uzupełniające do 15 nielandowych;
- `innistrad.txt` — setting Innistrad (gotycki horror, 5 kolorów);
- `azorius.txt` — biało-niebieskie tempo (W/U);
- `wiedzmin.txt` — Wiedźmin + Wschód (G/U/B).

Każda talia: 15–20 kart nielandowych (singleton) + ~10–15 lądów podstawowych
dopasowanych do kolorów (po M33 talie rosną wraz z batchami realnych kart —
nowe karty trafiają do swoich talii zamiast osobnych plików batchowych).
Pula many engine jest bezbarwna, więc kolor lądu to kwestia smaku — liczy się
liczba lądów.
