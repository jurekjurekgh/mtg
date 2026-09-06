# ADR 0029: Katalog kart to kolekcja właściciela; testy nie poszerzają katalogu

- **Status:** Zaakceptowana
- **Data:** 2026-09-06
- **Decydenci:** właściciel projektu (alarm 2026-09-06 po buildzie PR #100)

## Kontekst

Sesja wdrażająca kontrzenie zdolności (PR #93) potrzebowała nośnika mechaniki
`counter_ability`, którego nie było w katalogu, więc dopisała realną kartę
`Stifle` (CNS) razem ze snapshotem Scryfall i wpisem w `MANA_COSTS`. Wszystkie
bramki były zielone, bo karta była poprawna — a rejestr talii (ADR 0023) jest
WYPROWADZONY z pola `plan`, więc `1x Stifle` wszedł do `decks/wiedzmin.txt`,
czyli do talii, którą właściciel czyta jako „moją kolekcję". Alarm
właściciela nie dotyczył błędu w karcie, tylko faktu, że to agent zdecydował,
co gra w jego talii.

## Decyzja

1. **Katalog (`src/cards/card-data.js`) rośnie WYŁĄCZNIE z batchy właściciela**
   (jego kolekcja = słownik `tools/collection-art-ids.csv`, artId z arkusza).
   Agent NIGDY nie dodaje karty z własnej inicjatywy — także wtedy, gdy karta
   jest prawdziwa, zweryfikowana ze Scryfall i idealnie nadaje się jako nośnik
   mechaniki.
2. **Wyjątki są dwie kategorie, nie „karty specjalne" ogólnie:** lądy
   podstawowe i tokeny/niekolekcjonowalne definicje (nie taliuje się ich).
3. **Brak nośnika do testu rozwiązuje się kartą SYNTERETYCZNĄ w pliku testu**
   (obchodzi `gameObjectDataOf` i trafia na obiekt gry — engine i tak nie zna
   rejestru, ADR 0002). Mechaniki silnika pozostają card-agnostic; zakazane są
   też wyjątki w kodzie po nazwie czy ID karty (ADR 0002).
4. **Reguła ma strażnika:** `test/proweniencja-katalogu.test.js` — każda karta
   kwalifikująca się do talii (ten sam filtr co w generatorze: `supported` i
   nie `basic-`) musi mieć `artId` z kolekcji, a nazwa i plan muszą zgadzać się
   z wierszem słownika; dodatkowo `decks/*.txt` nie mogą wymieniać karty
   spoza słownika, a `MANA_COSTS` nie może mieć wpisu po karcie, której już nie
   ma.

## Konsekwencje

- Odkrycie mechaniki bez nośnika w kolekcji = dokumentacja i test na karcie
  synteretycznej, a karta wraca do właściciela jako propozycja do kolejnego
  batcha (backlog), nie do katalogu.
- Usunięcie karty jest pełne, gdy znika: definicja w `card-data.js`, klucz w
  `mana-costs-data.js`, `docs/cards/scryfall-<id>.json`, przydział `plan`
  (regeneracja `decks/`) i testy pinujące jej nazwę.
