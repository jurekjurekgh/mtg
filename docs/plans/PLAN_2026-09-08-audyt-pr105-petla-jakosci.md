# Plan sesji 2026-09-08 — audyt PR #105 i pętla jakości

Gałąź: `arena/01a0805b-mtg`. Baza: `aa2eb3f` (scalony PR #105).
Tryb: ADR 0020/0021; bez nowych kart, pełnego B0 i zmian progów benchmarku.

## Rozpoznanie i ryzyka

- Lektura: całe AGENTS, 29 aktualnych ADR-ów i rejestr, LESSONS (2331 linii), ENVIRONMENT (189 linii), PR #105 i handoff 2026-09-08b.
- PR #105 obejmuje 69 plików: wyceny/telemetrię bota, UI, przypisanie Shock do planu właściciela i poprawki regułowe. Dwa fałszywe znaleziska (explore, trample/protection) zostały cofnięte; audytuje się stan końcowy, nie historyczne deklaracje.
- Oczekiwana baza wg dopisku E10: fast 4772, all 4782, build 59 modułów / 3396,2 kB. README ma starsze liczby — odświeżenie dopiero po końcowych bramkach.
- Ryzyka: testy potwierdzające błędną interpretację CR; regresje w bliźniaczych ścieżkach; dane widoku i wycen; deduplikacja ETB zbyt szeroka; zmiana kontroli bez rzeczywistej zmiany kontrolera; techniczne duplikaty telemetrii. Hipotezy, nie ustalenia.

## Etapy i kolejność commitów

- [x] **P0 — baza i PR:** zmierzyć `npm test` + `npm run build`, wypchnąć ten plan osobno i otworzyć PR przed implementacją.
- [x] **P1 — audyt:** przeczytać diff każdego z 69 plików względem początku PR #105, skonfrontować zmiany ze ścieżkami wywołań oraz źródłami CR/Oracle (ADR 0030). Sprawdzić sens oczekiwań i selektywne mutacje, osobno dla gałęzi. Zapisać tabelę pokrycia, ustalenia i odrzucone hipotezy w `docs/audits/AUDYT_PR105_2026-09-08.md`; osobny commit audytu przed naprawami.
- [x] **P2 — naprawy potwierdzonych ustaleń:** każdy niezależny błąd: cytat źródłowy → test RED → minimalny fix → GREEN i anty-over-fix → pełny szybki rdzeń + build → osobny commit/push. Bez maskowania i bez przypadków po nazwie karty. Wyniki uzupełniają audyt oraz plan.
- [ ] **P3 — niedokończony plan / pętla jakości:** sprawdzić końcówkę planu PR #105; nie podejmować backlogu jako zlecenia. Zbudowany stół uruchomić Żywym Testerem, czytać transkrypt (taktyka, informacje, auto-pass), zweryfikować nowe klasy detektorem lub testem. Każdą naprawę zamykać oddzielnie.
- [ ] **P4 — brama PR i przekazanie:** `npm run test:all` + build, szybki benchmark przy zmianie bota/ofert, bez pełnego B0. Aktualny raport, PROJECT_HISTORY, handoff, README i kumulatywny opis PR; czyste drzewo i gałąź wypchnięta. Merge wyłącznie właściciela.

## Wyniki

W trakcie. Liczby i werdykty będą wpisywane po pomiarze, nie na podstawie deklaracji poprzedniej sesji.

- P0: baza 4772/4772, build 59 / 3396,2 kB; plan `7237a49`, PR #106.
- P1: 69/69 plików; 5 prób mutacyjnych (4 RED, 1 luka testu). Raport przed
  naprawami: A kontroler, B hand_top, C stare ograniczenie obrażeń, D Equipment
  vs aura, E test untapu. P2 pozostaje otwarte.

- P2 zamknięte: A `842bae7`, B `b8fff42`, D `b83f367`, C `b11e34c`,
  E (test-only) i słabe piny C1/Shock. Fast 4789/4789, build 3395,2 kB / 59.
  P3/P4 pozostają do wykonania.
