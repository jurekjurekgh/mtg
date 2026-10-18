# PLAN 2026-10-18a — PMSSB-67/F5: próg latania skalowany mocą

**Decyzja właściciela (2026-10-18):** „Powinniśmy skalować próg do mocy." Dotyczy `creatureKwFlyingFloor`
(PMSSB-64 ustawił płaskie 3), otwartego punktu z `docs/audits/PMSSB67_KW_CAVEATY_2026-10-17.md`.

## Problem (PRZED)
- Gałąź bez latającego blokera wroga: `max(floor, 8·moc/3)`. Dla każdej mocy ≥ 1 wygrywa `8·moc/3`,
  więc próg jest martwy poza mocą 0–1.
- Gałąź z latającym blokerem wroga: `floor` (płaskie 3 dla każdej mocy). To tu próg jest jedyną wartością.
- Skutek: latający stwór 0 mocy wyceniany jak 3-mocowy (Δ 2.7 po wadze 0.9), a 5-mocowy zablokowany też 2.7.

## Cel
Próg = `creatureKwFlyingFloor · moc/creatureKwRefPower` (moc referencyjna 3). Zablokowany lot = `moc` (×wagi),
odblokowany = `max(próg, 8·moc/3)`. Dla mocy 3 bez zmian (3 → 3).

## Kroki (wzór: procedura PMSSB 0–7)
0. Ten plan (commit).
1. POMIAR PRZED: `tools/pmssb67-prog-latania-sonda.mjs` (moc 0–5 × stoły pusty / latający wróg / bloker 4/5 / dwa 5/5),
   wynik → `/home/user/prog-latania-przed.json`. Moc 0/1 zablokowane = 2.7; moc 3 = 2.7 / 7.2.
2. AUDYT (anty-over-fix M429 c): komentarz w kodzie twierdził, że moc ≤1 zostaje na dawnej wartości.
   Ten zapis jest świadomie wycofany: 0-mocowy lot nie zadaje obrażeń, więc 0 jest poprawne.
   Inwersja (przepuszczony < zablokowany) jest zakazana — pin.
3. IMPLEMENTACJA: `heuristic-bot.js` (`creatureKeywordValue`, gałąź `flying`) + pokrętło
   `creatureKwFlyingFloorScaled` (1 = skala mocą, 0 = dawne płaskie 3). Klucz na liście parametrów.
4. TESTY: `test/audyt-pmssb67-prog-latania.test.js` — RED przed zmianą, GREEN po; pokrętło ×0 = dawne wartości;
   mutacja (płaski próg) pada.
5. EWALUACJA: dump diff vs `dump-f4` (fixture `2fe4b347…`); mirror 3000/5000/9000; `test:all`.
   Re-pin pinów z flying przy mocy 0–1 lub zablokowanym locie — z formułą w komentarzu.
6. DOKUMENTACJA: raport F5 w `docs/audits/PMSSB67_KW_CAVEATY_2026-10-17.md`, wpis w `docs/PMSSB.md`
   i `docs/PROJECT_HISTORY.md`. Zamknięcie dwóch punktów: atomiczność L48 (zamknięte przez właściciela,
   bez dalszej pracy) i Ad 3 (M243/C — wariant A, już wdrożony w PMSSB-66: okno end step przeciwnika + wolne lądy).
7. Bramy: `test:all` zielony (nie sam `npm test`), build, `cr-numery --sprawdz`; push po każdym kroku.
