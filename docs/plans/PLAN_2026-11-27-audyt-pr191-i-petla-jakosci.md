# Plan sesji — audyt PR #191 i pętla jakości

Gałąź `arena/573549e6-mtg`, baza `e9266da` (scalenie PR #191). Tryb: ADR 0020 i ADR 0021; bez nowych kart spoza zlecenia właściciela (ADR 0029) i bez pełnego B0 (ADR 0018).

## Etapy i kryteria

- [x] E0: plan, bazowe `npm test` i `npm run build`, osobny commit i PR przed kodowaniem.
- [x] E1: audyt PR #191 (ostatni scalony) względem bazy `3facebd` — 49 plików, w tym 8 plików `src/`: weryfikacja zachowanych poprawek (F-190/1, F-190/2, F-190/3, F-190/5, F-190/6, F-190/7, F-190/16, F-190/17, F-190/21–25), czystość wycofań (F-190/19, F-190/20, F-190/24, F-190/27, F-190/29), zmiany testów (bez poluzowania asercji). Reguły weryfikowane u źródła (ADR 0030); raport w `docs/audits/AUDYT_PR191_2026-11-27.md`. Wynik: brak błędów; obserwacja O-1 (walidator w `activateAbility` nieprzypięty/redundantny — nie defekt).
- [x] E2: brak potwierdzonych błędów do naprawy (audyt czysty). Mutacje L13 wykonane jako dowód pinów (F-190/1, F-190/5, F-190/6, F-190/17-performActivation: RED).
- [x] E3: pętla jakości ścieżkami innymi niż sesja PR #191 (ADR 0021): 5 partii Żywego Testera na taliach batcha 75 (Frilled, Coordinated Maneuver, Gutsy, Battle Hurda, Gysahl/profil defensive) — detektory 0 w każdej; polowanie na rozjazdy z CR: ruling Frilled Sea Serpent M20 2019-07-12 zweryfikowany u źródła i w implementacji (flaga `cantBeBlockedUntilTurn` tylko w walidacji deklaracji bloku — brak cofania bloku). Aktywacja Frilleda {5}{U}{U} nadal nieodwiedzona żywo (znana luka pokrycia; ścieżka wspólna, pinowana testami 2A-3/2A-4).

## Ryzyka

- PR #191 to audyt z selektywnymi wycofaniami — audyt musi zweryfikować zarówno zachowane poprawki, jak i czystość wycofań (martwy kod, osierocone piny).
- Zewnętrzne źródła Oracle/CR dostępne przez fetch_page (sandbox bash bez egressu); nie przedstawiać pamięci jako weryfikacji (ADR 0030).
- Nie uruchamiać pełnej macierzy benchmarku bez polecenia właściciela. Testy logować do `.arena/` (cicho, bez pełnego wyjścia).

## Postęp (2026-11-27)

E0: plan + PR przed kodem. E1 w toku.
