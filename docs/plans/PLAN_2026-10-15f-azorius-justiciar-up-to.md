# Plan 2026-10-15f — Azorius Justiciar: „up to two” bez modala z permutacjami

Zgłoszenie właściciela (tura 11, Azorius Justiciar): „Modal wyboru to ZABRONIONY
modal ze wszystkimi permutacjami. Jedynym dozwolonym rodzajem modala wielocelowego
jest wybór wielu i zatwierdzenie!!!!! Natychmiast to napraw.”

## Rozpoznanie

- Silnik (`src/engine/game-state.js`, trigger „up to N”, M157/F4a): oferuje
  podzbiory celów jako komendy `resolve_trigger_target` z `targetIds`
  (rozmiary 1..N oraz pusty przy „up to”, CAP 32).
- `upToTargetsPlanOf` (`src/table/multi-target.js`) zamienia to w JEDEN wpis
  panelu z ptaszkami. Panel sprawdza go PIERWSZY (`src/table/main.js` ≈740),
  przed `multiTargetPlanOf` i przed listą przycisków (`buttonsPlanOf` ≈1321).
- Przyczyna: `upToTargetsPlanOf` zwracał `null`, gdy kandydatów było ≤ N
  (dwóch przeciwników przy „up to two”) albo gdy największy wariant miał 1 cel.
  Wtedy komendy spadały na listę przycisków `[c1,c2] [c1] [c2] []` — zakazany modal.
- Sonda silnika (1–4 przeciwników): 4 kandydatów → plan jest; 1 i 2 → `null`.

## Zakres

1. `upToTargetsPlanOf`: usunąć dwa strażniki zwracające `null` (≤ N kandydatów,
   max wariantu ≤ 1). Zostaje tylko warunek „mniej niż dwie opcje = brak wyboru”.
2. Test na przepływie silnika: `test/uwaga-j-up-to-dwoch-kandydatow-2026-10-15.test.js`
   (1–4 przeciwników → jeden plan, `minTargets` 0, wiersze = kandydaci).
3. Odrzucone ryzyka: `resolve_optional_trigger_choice` też niesie `targetIds`,
   ale odmowa to `pass_priority` bez pola, więc `list.length !== options.length`
   wyłącza ten przypadek (zweryfikowane kodem). Proliferate ma własną gałąź wcześniej.

## Weryfikacja

- RED: `.arena/red-j.log` (2 pass / 2 fail: przypadki 1 i 2 kandydatów).
- GREEN: `.arena/green-j.log` (4/4). Powiązane 104/104 (`.arena/rel-j.log`).
- `npm test` 8257/8257 rc=0 (`.arena/tests-fast-j.log`). `npm run build` rc=0.
- Tymczasowa talia testera (`decks/tmp-j-justiciar.txt`) usunięta przed buildem.

## Mini-roadmapa

- [x] Odtworzenie przyczyny w silniku i w kodzie panelu.
- [x] Test RED (przepływ silnika, 1–4 przeciwników).
- [x] Poprawka `upToTargetsPlanOf`, GREEN, testy powiązane.
- [x] `npm test` rc=0, build rc=0.
- [ ] Commit + push (bez force), aktualizacja opisu PR #166 przez REST. Bez scalania.
- [ ] Weryfikacja przez właściciela w żywej grze (Justicier z dwoma przeciwnikami).

Uwaga: plan spisano po poprawce (błąd wykryto w sesji tury 11, kod powstał przed planem).
