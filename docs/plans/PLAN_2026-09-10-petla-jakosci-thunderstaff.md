# PLAN 2026-09-10 — pętla jakości Żywym Testerem: Thunderstaff noop (M260/F1)

Kontynuacja sesji `arena/01a08788-mtg` / PR #111 (ADR 0013/0020 — jeden PR
kumulacyjny). Po domknięciu znalezisk właściciela A–D (F-A..F-D) sesja przeszła
w **pętlę jakości Żywym Testerem do wyczerpania budżetu** (ADR 0021) na tym samym
PR. Plan publikowany PRZED kodem (ADR 0020 A), commit zielony dopiero po bramkach.

## Rozpoznanie (zmierzone)

- 16 partii Żywego Testera (3× paczki: 4 + 6 + 6) — profile `greedy`/`hoarder`/`explorer`,
  seedy 1..777 i losowe, `run-game.mjs --steps 500-600 --tick-rate 0-0.25`:
  **15× DET0**, **1× `noop` Thunderstaff** w `T.16 Główna 1` przed deklaracją ataku
  (warhammer-wg vs tarkir-wur, seed 777, hoarder) — sonda `detectors.mjs` probe
  `passive opponent` słusznie Oś 4: „tylko koszt” (2 many + tap), bez efektu.
- Triaż:
  - `src/cards/card-data.js:10098-10110` — zdolność `{2},{T}: buff_attacking_creatures +1/+0`.
  - `src/engine/effects.js:2096-2125` — efekt rozstrzyga się w early-return gdy
    `state.combat.attackers` puste (CR 611.2c, zbiór atakujących mrożony w chwili
    ROZSTRZYGNIĘCIA): `attackerIds = state.combat?.attackers ?? []` → filtr
    battlefield creature → `if(buffIds.length===0) return` — bez `emitMassBuff`.
  - Oferta była widoczna także poza walką (Główna 1), więc sonda złapała
    „koszt bez skutku”. To NIE fałszywy alarm detektora — efekt realnie w nic.
  - Luka w `src/engine/abilities.js:325-420` — `effectIsNoOpOnTarget` / `abilityEffectIsNoOp`
    nie miał case `buff_attacking_creatures`: oferował `{2},{T}` gdy 0 atakujących.

## Etapy (każdy = bramki zielone + push)

### F1. Thunderstaff poza walką — ukryć ofertę (M260/F1) [X]
Objaw: aktywacja `{2},{T}` w Głównej 1 przed deklaracją — koszt bez premii.
Fix: w `effectIsNoOpOnTarget` dodać case `buff_attacking_creatures`:
  `attackers = state.combat?.attackers ?? []`; `attackers.length===0 → true`;
  inaczej sprawdzić czy choć jeden `object.zone===battlefield && kind===creature`
  żyje — brak → `true` (no-op). Ukrycie oferty (U9/M103), legalność CR 602.2b
  zachowana (execute nadal przyjmie, gdyby wywołana programowo).
Strażnik: detektor `noop` w Testerze (istniejący) + re-run tego samego seeda 777
  hoarder — przed fixem 1 zgłoszeń, po fixie 0.
Bramki: `npm test` 5055/5055, `npm run test:all` 5065/5065, `npm run build` 61/3452,2 kB,
  `bot-benchmark` 10/10, re-run 10 partii testera dla regresji (10/10 DET0).
  Kontynuacja pętli (bez kodu): 20 świeżych partii (`--steps 400`, 24 talie rotacyjnie,
  6 profili) — **20/20 DET0**, 20/20 `NIEWYCENIONE: brak` (log `/tmp/batch_2026-09-10.txt`) +
  10 głębokich (`--steps 600 --tick-rate 0.15`) **10/10 DET0** (log `/tmp/batch2_2026-09-10.txt`) +
  10 celowanych warhammer-wg (`--steps 500`, 5 botów rotacyjnie, seedy 6589..6760) **10/10 DET0**
  (log `/tmp/batch3_2026-09-10.txt`); razem po fixie **50/50 DET0** (66 łącznie w pętli).

## Ryzyka / pułapki
- Gałąź już na origin (`3f77da8`, PR #111) — tylko przyrostowo, bez force; `reset --hard` kasuje WD.
- `dist/` gitignorowany — tester mierzy `dist/mtg-table.html`, więc po zmianie src **zawsze** `npm run build`.
- `src/engine/abilities.js` ma więcej efektów no-op po nazwie; każdy nowy `buff_*` wymaga dopisania case.
- Polskie znaki w `abilities.js` — przez `edit_file` z UTF-8 (komentarz L28/M260).

## Podsumowanie wykonania

F1: `src/engine/abilities.js` nowy case `buff_attacking_creatures` w `effectIsNoOpOnTarget` —
ukrywa `{2},{T}` gdy brak żywych atakujących (CR 611.2c early-return w `effects.js:2096-2124`);
re-run warhammer-wg vs tarkir-wur seed 777 hoarder: 1→0 zgłoszeń; 10 partii 10× DET0 + 20 partii
świeżych 20/20 DET0 + 10×600 kroków 10/10 DET0 + 10 warhammer-wg 10/10 DET0 (łącznie **50/50 po fixie**, 66 w całej pętli).
Bramki: fast 5055/5055, all 5065/5065, build 61/3452,2 kB, benchmark 10/10.
Commit kodu: `41bf0f4 fix(abilities): hide Thunderstaff outside combat` (M260/F1); doc-only:
aktualizacja HANDOFF/PLAN/HISTORY/PR po 40 dodatkowych partiach (ten sam PR, bez zmian src).
Domknięcie: wpis PROJECT_HISTORY, HANDOFF_2026-09-10, README, opis PR #111 (PATCH).
