# Plan: Aerith Rescue Mission „Schody” — dwie warstwy wyboru (zgłoszenie H)

Data: 2026-10-15. Gałąź: `arena/3a534672-mtg`. PR: #166.

## Rozpoznanie

- Silnik jest poprawny: tryb 1 enumeruje kombinacje (cele × stun), a `tap_permanents`
  (`allChosen`) tapuje wszystkie wybrane cele. Potwierdzone `.arena/repro-h.mjs`
  i sondą na komendach `legalCommands` (13 komend trybu 1, np. `rager+ins1` ×2: stun
  `rager` i stun `ins1`).
- Problem w UI: `targetKey` (`src/table/multi-target.js`) ignoruje `stunTargetId`,
  a `commandForSelection` zwraca PIERWSZĄ komendę o tym zbiorze celów. Gracz nie
  wybiera stuna; zatwierdzany jest wariant wybrany przez kolejność w ofercie.
- Plan kreatora dla Aerith to `multiTargetPlanOf` (nie `upToTargetsPlanOf`, bo komendy
  niosą `targets`, a nie `targetIds`).

## Decyzja (w zakresie agenta)

Zmiana tylko w UI. Silnik i protokół komend bez zmian: zatwierdzenie nadal zwraca
komendę z `legalCommands` (L48). Warstwa 2 jest zbiorem wyborów, który silnik już
enumeruje. Właściciel zlecił dwie warstwy wprost (zgłoszenie H, tura 2).

## Etapy

1. **RED** — `test/uwaga-h-aerith-schody-dwie-warstwy-2026-10-15.test.js`:
   - plan niesie `stunKey`, `stunIds`; `stunCandidatesFor(commands, targets)`
     zwraca stuny dla zbioru celów;
   - `commandForSelection(..., { targets, stunTargetId })` wybiera wariant ze stunem;
   - kreator (mini-DOM): warstwa 1 = cele (ptaszki), warstwa 2 = radio stunów, wiersze
     poza wybranymi celami wyłączone; `Zatwierdź` gaśnie bez stuna; zatwierdzenie
     oddaje komendę z wybranym stunem.
2. **GREEN** — `multi-target.js` (`stunKey`, `stunCandidatesFor`, `commandForSelection`
   z `stunTargetId`), `choice-request.js` (sekcja stun, `setDisabled`, status).
3. **Mutacje** — wyłączyć sekcję stun / filtr stuna; testy muszą paść.
4. **Pełny zestaw** — `npm test > log 2>&1`, powiązane testy kreatora, benchmark
   `node tools/benchmark.mjs` (bez pełnego B0).
5. **Dokumentacja** — wpis w opisie PR #166 (wiersz H).

## Ryzyka

- Cele bez stuna (zwykłe „up to” z innym kształtem) nie mogą dostać warstwy 2:
  wymiar włącza się tylko, gdy komendy niosą >1 różnych `stunTargetId`.
- Pusty wybór celów (0) to legalny wariant bez stuna — warstwa 2 nie blokuje go.
- Wiersze stun muszą mieć stabilne `id` (obiekty), a status nie może mylić warstw.
- Nie podnosić progu budżetu LESSONS; wpis lekcji tylko, jeśli zmieni się reguła.
