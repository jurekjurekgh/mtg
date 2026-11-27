# Plan sesji — audyt PR #191 i pętla jakości

Gałąź `arena/573549e6-mtg`, baza `e9266da` (scalenie PR #191). Tryb: ADR 0020 i ADR 0021; bez nowych kart spoza zlecenia właściciela (ADR 0029) i bez pełnego B0 (ADR 0018).

## Etapy i kryteria

- [x] E0: plan, bazowe `npm test` i `npm run build`, osobny commit i PR przed kodowaniem.
- [ ] E1: audyt PR #191 (ostatni scalony) względem bazy `3facebd` — 49 plików, w tym 8 plików `src/`: weryfikacja zachowanych poprawek (F-190/1, F-190/2, F-190/3, F-190/5, F-190/6, F-190/7, F-190/16, F-190/17, F-190/21–25), czystość wycofań (F-190/19, F-190/20, F-190/24, F-190/27, F-190/29), zmiany testów (bez poluzowania asercji). Reguły weryfikować u źródła (ADR 0030); raport w `docs/audits/AUDYT_PR191_2026-11-27.md`.
- [ ] E2: naprawić potwierdzone błędy odrębnymi zielonymi commitami (testy regresji RED→GREEN, mutacje L13); dla każdej zmiany `npm test` i `npm run build`.
- [ ] E3: pętla jakości ścieżkami innymi niż w sesji PR #191 (ADR 0021): Żywy Tester na taliach batcha 75 (w tym aktywacja Frilled Sea Serpent {5}{U}{U} — luka pokrycia z handoffu PR #190), polowanie na rozjazdy z CR poza obszarami F-190 (koszty ofiar, drenaż, blokowanie Vaporkina, koszty X, LKI Gutsy). Podsumowanie w raporcie, handoff, opis PR.

## Ryzyka

- PR #191 to audyt z selektywnymi wycofaniami — audyt musi zweryfikować zarówno zachowane poprawki, jak i czystość wycofań (martwy kod, osierocone piny).
- Zewnętrzne źródła Oracle/CR dostępne przez fetch_page (sandbox bash bez egressu); nie przedstawiać pamięci jako weryfikacji (ADR 0030).
- Nie uruchamiać pełnej macierzy benchmarku bez polecenia właściciela. Testy logować do `.arena/` (cicho, bez pełnego wyjścia).

## Postęp (2026-11-27)

E0: plan + PR przed kodem. E1 w toku.
