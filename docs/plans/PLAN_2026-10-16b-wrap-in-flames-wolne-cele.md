# PLAN 2026-10-16b — Uwaga O: Wrap in Flames („up to three target creatures”)

## Zgłoszenie
Właściciel (tura 18): modal wyboru pozwala wybrać tylko jedną kreaturę na cel;
0, 2 i 3 nie da się wybrać i zatwierdzić. Oczekiwane: wybór od 0 do 3 celów
z zatwierdzeniem, bez ściany permutacji.

## Diagnoza
- Silnik i planer dla 3 stworów są poprawne (8 komend, rozmiary 0–3, plan 0..3).
- Przyczyna: `variableTargetCombos` ogranicza oferty do `VARIABLE_TARGET_OPTION_CAP`
  (32). Przy szerszym stole limit usuwa CAŁE rozmiary: 6 stworów → 5 z 15 kombinacji
  po dwa cele; 7 stworów → zero kombinacji po dwa cele.
- Kreator szuka komendy dokładnie pasującej do zaznaczenia (`commandForSelection`).
  Brak dopasowania = „Zatwierdź” nic nie robi.
- Silnik waliduje PEŁNO (liczba celów w [min,max], legalność) — sprawdzone sondą:
  2 cele spoza oferty przyjęte, 4 cele (max 3) odrzucone.

## Etapy
1. [x] Test RED `test/uwaga-o-wrap-in-flames-2026-10-16.test.js` (O/6, O/9, O/10 czerwone).
2. [x] `multi-target.js`: flaga `freeTargets` (oferta ucięta względem sumy
   dwumianów min..max) i `commandForFreeTargets` (szablon + wybrane cele).
   Tylko zwykła lista celów: bez pozycji (`slots`), X, kosztu i stuna.
3. [x] `choice-request.js`: fallback `commandForChosen` używany tylko przy `freeTargets`.
4. [x] `npm test` pełny (8293/8293, rc=0), `npm run build` rc=0.

## Ryzyka / granice
- Gdy oferta jest ucięta, komenda składana przez kreator nie jest w `legalCommands`;
  silnik waliduje ją przy wykonaniu (decyzja zgodna z zasadą „walidacja w silniku”
  z J). Bot nadal korzysta wyłącznie z legalnych ofert.
- Lista celów to suma celów z ofert. Jeśli limit 32 uciąłby pojedyncze cele
  (>32 kandydatów), kandydat mógłby zniknąć z listy kreatora — poza zakresem tego
  zgłoszenia, odnotowane.
- 0 celów przechodzi także przed poprawką (O/8 jako strażnik).
