# PLAN M269 — Brązowa odznaka: 5 błędów vs Comprehensive Rules

**Data:** 2026-08-31 · **Gałąź:** `arena/01a058db-mtg` · **PR:** #91

## Zadanie właściciela

Znaleźć i naprawić **5 unikalnych błędów** vs CR (brązowa odznaka).
Jeśli zostanie budżet — kolejne 5 (srebrna).

## Dlaczego tą ścieżką (a nie Żywym Testerem)

Ostatnie 4 sesje (M265–M268) dały 6 lekcji, z czego 5 dotyczy WARSTWY
PREZENTACJI (etykiety, deskryptory kosztów, tytuły grup). Żywy Tester
z definicji widzi to, co widać na stole. Ostatnie 8 partii dało zero
zgłoszeń, a jedyne znalezisko rundy 3 wyszło z ręcznego czytania.
Ostatnia odznaka: **M73d, 11 sierpnia** (20 dni temu), też przez tester UI.
Silnik reguł ma inne błędy i wymaga innego narzędzia — ADR 0021 nakazuje
„inne ścieżki niż poprzednia sesja".

## Metoda — L11, w kolejności udokumentowanej skuteczności

1. **Niespójność między analogicznymi implementacjami** (najskuteczniejsza;
   w tej sesji dała L104 przypadkiem). Silnik ma 171 typów efektów —
   porównanie rodzin parami to gotowe wejście.
2. **Skan strukturalny** — komplet pól obiektu przed/po operacji.
3. **Ręczne obejścia jako sygnał** — `grep` powtórzonych mutacji pól.
4. Skan katalogu Oracle↔pola (w dojrzałym katalogu dużo fałszywych alarmów).
5. Punktowe sondy CR — tylko do POTWIERDZANIA poprawności.

## Rygor (L11 + ADR 0002)

- Każdy kandydat wymaga **repro headless PRZED naprawą** — inaczej nie
  odróżnię błędu reguł od artefaktu testu (`addObject` domyślnie
  `summoningSickness: false` itd.).
- Naprawa u **root cause**, nigdy po nazwie/ID karty.
- Każdy błąd dostaje **strażnika klasowego**, nie pin na jedną kartę.
- Weryfikacja **mutacyjna** strażnika (przywrócenie buga → RED).
  Do mutacji używać KOPII pliku, nie `git checkout` (M268: skasowałem
  sobie tak niezacommitowaną naprawę).
- Commit po każdym zielonym `npm test` + `npm run build`.

## Kryteria ukończenia

- [ ] 5 unikalnych błędów vs CR znalezionych, zreprodukowanych i naprawionych
- [ ] każdy z cytatem reguły CR i strażnikiem klasowym
- [ ] `npm test` + `npm run build` zielone po każdym commicie
- [ ] `npm run test:all` (brama PR) zielone na koniec
- [ ] lekcja/ADR jeśli wyjdzie klasa błędu, nie pojedynczy przypadek
- [ ] (opcjonalnie) kolejne 5 na srebrną odznakę

## Obszary do sprawdzenia (hipotezy startowe)

- rodziny efektów o wspólnym rdzeniu (exile/damage/gain_life ×N wariantów)
- strefy: co dzieje się z permanentem przy zmianie strefy (CR 400.7)
- kontrola vs własność (CR 108.3) w efektach zwracających karty
- timing triggerów i „intervening if" (CR 603.4)
- liczniki, tarcze, prewencja (CR 614/615)
