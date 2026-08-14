# PLAN_2026-08-14 — M89 cd.: bugi UI/UX właściciela (A, B, C, D)

## Kontekst

Właściciel zgłosił 5 bugów z testów na iPhonie (2026-08-14). Bug E (bot atakuje ⅔ w ⅚) już naprawiony w working dir. Pozostałe 4 (A, B, C, D) są UI/UX/CSS i trzeba je naprawić u root cause w kodzie `src/table/`.

## Bugi do naprawienia

### Bug A — swipe w górę zwęża widok do ⅔ ekranu
**Objaw:** Pierwszy swipe w górę po nowym seedzie zwęża widok do ⅔ ekranu (pusta przestrzeń po prawej).
**Ścieżka badania:** `src/table/gestures.js` (installTapGesture), `src/table/index.html` (CSS), `src/table/main.js` (bootstrap).
**Podejrzewam:** viewport zoom, transform zostaje po "tapie", zła detekcja swipe vs tap.

### Bug B — Forever Young + ptaszek → "Poddaj walkę"
**Objaw:** Po rzucie Forever Young z zaznaczonym ptaszkiem pomijania → ekran z jedyną opcją "Poddaj walkę" (zniknął tekst o błędzie).
**Ścieżka:** `src/table/session.js` (auto-pass), `src/table/render.js` (noteBotMove, commandLabel, recheckAutoPass), `src/table/main.js` (pass-while-pending).
**Podejrzewam:** Auto-pass odpala się po pierwszym graczu (p1), ale czeka na pass p2 — nigdy nie następuje, więc modal znika. Powinno: po rzucie czaru z pending choice auto-pass czeka aż czar się rozstrzygnie.

### Bug C — Carrion Call: brak okna na instant w odpowiedzi
**Objaw:** Bot rzuca Carrion Call (instant). Brak okna na instant w odpowiedzi mimo many, brak wpisu o tokenach w modalu "Ruch przeciwnika".
**Ścieżka:** `src/table/render.js` (noteBotMove, hasMeaningfulDecision), `src/table/session.js` (bot move events).
**Podejrzewam:** `noteBotMove` nie uwzględnia tokenów tworzonych przez czar, albo `hasMeaningfulDecision` źle klasyfikuje instant po czarze bota.

### Bug D — Fake Your Own Death — brak ptaszka pomijania
**Objaw:** Instant z wyborem celu — nie ma pola ptaszka pomijania.
**Ścieżka:** `src/table/render.js` (OPTION_IGNORABLE_TYPES, commandLabel, noteBotMove).
**Podejrzewam:** `OPTION_IGNORABLE_TYPES` nie zawiera `'cast_spell'` dla instant z wyborem celu, albo `noteBotMove` filtruje nie tylko `commandLabel` ale pomija `pendingChoices`.

## Kolejność prac

1. Plan sesji (ten plik)
2. Badanie `src/table/gestures.js` i `src/table/index.html` (bug A — swipe)
3. Badanie `src/table/session.js` i `src/table/render.js` (bug B — Forever Young)
4. Badanie `src/table/render.js` (bug C — Carrion Call modal/tokens)
5. Badanie `src/table/render.js` (bug D — ptaszek dla cast_spell z target choice)
6. RED testy dla każdego bugu
7. Fix u root cause
8. npm test + npm run build
9. Commit M89 cd.: UI bugi (A, B, C, D) + push

## Definition of Done
- Każdy bug ma RED test (lub headless reprodukcję) i GREEN po fixie
- 1531+ testów zielonych
- build OK
- Commit + push
