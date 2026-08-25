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

## Bieżące talie (16 plików = 12 jednoplanowych + 4 worki)

Talie **buduje generator** `tools/generate-plan-decks.mjs` — on jest źródłem
prawdy przydziału karty do talii, a `test/repo-decks.test.js` pilnuje, że pliki
w `decks/` są zgodne z generatorem (uruchomienie go nie może nic zmienić) oraz
że każda wspierana karta nielandowa jest w DOKŁADNIE jednej talii.

Zasady przydziału ([ADR 0023](../docs/decisions/0023-decks-per-plan-and-benchmark-sample.md)):

- **plan z ≥ 15 wspieranymi kartami = własna talia jednoplanowa** — obecnie:
  `alara`, `dominaria`, `forgotten-realms`, `innistrad`, `mirrodin`, `ravnica`,
  `srodziemie`, `tarkir`, `theros`, `warhammer`, `wiedzmin`, `zendikar`;
- **mniejsze plany trafiają do jednego z 4 worków** (mapa `WOREK_DECKS`
  w generatorze): `worek-basni`, `worek-dziki`, `worek-legend`,
  `worek-mroczny`;
- **awans z worka jest automatyczny**: gdy plan dobije do 15 kart, generator
  przy najbliższym uruchomieniu daje mu własną talię i ostrzega o martwym
  wpisie w mapie (M181). Gdyby worek spadł przez to poniżej minimum
  walidatora, generator zatrzymuje się czytelnym błędem — przetasowanie planów
  między workami to świadoma decyzja w mapie, nie automat;
- **testy i benchmark używają wyłącznie talii jednoplanowych**; szybka próbka
  benchmarku to `BENCH_DECKS` w `tools/benchmark.mjs` (6 talii), więc konwersja
  worka nie wymusza rekalibracji progów.

**Nie przepisuj listy talii do innych dokumentów** — przy każdym batchu kart
generator potrafi ją zmienić. Aktualny stan wypisuje
`node tools/table-tester/run-game.mjs --list-decks`, a rozjazd nazw między
dokumentacją a `decks/` czerwieni
`test/m203-talie-testera-i-dokumentacji.test.js` (M203; wcześniej w tym pliku,
w `docs/setup/TESTER_STOLU.md` i w domyślnych talii testera żyły nazwy
`green`/`red`/`azorius`/`tokens`…, które przestały istnieć w M178).

Każda talia: singleton, `landy = ceil(liczba nielandów / 2)`, kolory landów
proporcjonalnie do pipów w kosztach talii (każdy używany kolor ≥ 1). Pula many
jest **kolorowa** (ADR 0015), więc kolor landu ma znaczenie regułowe — generator
liczy go z pipów kart, a nie „dla smaku".

## Manabaza: reguła 2 : 1 (M132, zgłoszenie właściciela 2026-08-17)

**Na każde 2 karty nielandowe przypada co najmniej 1 ląd** (≈ 33 % lądów;
klasyczna manabaza Magic to ~40 %, czyli 17/40 albo 24/60). Górny limit to
55 % lądów — małe talie bywają landowo przeważone, ale nie bez granic.

Regułę egzekwuje `test/m132-proporcje-landow.test.js` i podaje wprost, ilu
lądów brakuje. **Dokładając karty do talii, dosyp lądy w tej samej zmianie** —
cztery talie (green 2,52 · red 2,32 · black 2,25 · azorius 2,18) zjechały
poniżej progu właśnie dlatego, że kolejne batche dokładały same czary,
a konwencja żyła wyłącznie w tym pliku, bez strażnika w testach.
