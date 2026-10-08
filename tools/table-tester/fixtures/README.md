# Fixture'y talii Żywego Testera

Talie w tym katalogu **nie są** taliami repozytorium (`decks/`) — są
sondażowymi zestawami pod konkretny audyt. Dlatego leżą POZA `decks/`:

- talie w `decks/` są rejestrem (README + `tools/generate-plan-decks.mjs`) i
  podlegają ADR 0023 (każda karta w DOKŁADNIE jednej talii), walidacji
  `validateDeck` (min. 15 kart nielandowych) i strażnikom formatu — sonda
  audytowa, która dzieli karty z taliami planowymi, łamałaby te inwarianty;
- `tools/table-tester/run-game.mjs` bierze listę talii z `decks/`
  (`deckNames()`), a artefakt `dist/` dostaje je z `npm run build`.

## Powtórka audytu z danym fixturem

```bash
cp tools/table-tester/fixtures/regen-audyt.txt decks/   # tymczasowo, na czas audytu
npm run build                                            # dist/ musi znać talię
node tools/table-tester/run-game.mjs --human regen-audyt --bot the-edge …
rm decks/regen-audyt.txt                                 # i z powrotem — inaczej czerwienieją strażnicy talii
```

## Zawartość

- `regen-audyt.txt` — audyt zgłoszenia E (regeneracja, plan
  `docs/plans/PLAN_2026-10-07b-audyt-pr157-petla-jakosci.md`): Exterminator
  Magmarch + Frontline War-Rager + Wedgelight Rammer + Warmaker Gunship, lądy
  na 4 kolory. Wynik pomiaru: plan/handoff sesji 2026-10-07b.
