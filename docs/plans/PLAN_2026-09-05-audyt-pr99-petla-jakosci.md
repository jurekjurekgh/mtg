# Plan sesji 2026-09-05 (arena/01a072eb): audyt PR #99 + pętla jakości

## Kontekst

- Start: `main` = commit `1a14176` (scalony PR #99 z sesji `arena/01a071d1`).
- Prompt właściciela: „kontynuujemy projekt" (brak nazwanego tematu → ADR 0021, pętla domyślna).
- Poprzednia sesja zakończyła się: `npm test` 4486/4486, build 59/3284.7kB, benchmark szybki 84,1% (565/672),
  event-contract-audit czysty; PR #99 scalony.
- 1 sesja = 1 gałąź = 1 PR (ADR 0013/0020).

## Etapy (kolejność commitów)

### E1. Audyt PR #99 (ADR 0020 B)
- Przegląd 7 zmienionych plików (3 testy, 1 zmiana w `heuristic-bot.js`, docs):
  - `src/controllers/heuristic-bot.js` — 3 nowe klucze w `ETB_EFFECT_BONUS` (untap_permanent,
    springbloom_sacrifice_search, fertile_thicket_reveal); poprawność ADR 0002
    (deskryptory, nie nazwy kart); brak duplikatów z innymi gałęziami; wartości
    konserwatywne (skala kolejności rzutów).
  - `test/etb-effect-bonus-coverage.test.js` — strażnik pokrycia + strażnik
    kierunku (L5/L29/L31). Czy test naprawdę testuje regułę? Czy RED→GREEN?
  - `test/trigger-condition-clause-coverage.test.js` — poprzedni commit PR #99.
  - Docs (audyt, handoff, PROJECT_HISTORY, plan) — spójność, brak martwych wpisów.
- Sprawdzenie: `npm test` + `npm run build` + benchmark szybki.
- Werdykt + obserwacje w `docs/audits/AUDYT_PR99_2026-09-05.md` i opisie PR.

### E2. Pętla jakości (ADR 0021 4a/4b)
- (a) Żywy Tester (3–5 nowych matchupów, profile greedy + explorer) z
  detektorami; naprawy u root cause, nowe detektory jeśli nowa klasa błędów.
- (b) Statyczna weryfikacja inną ścieżką niż w poprzedniej sesji (ostatnia sesja
  robiła triggerConditionClause + event-contract-audit + ETB coverage) —
  wybierz ścieżkę: inne narzędzie z `tools/` albo inna klasa CR (L108 deadlock
  reguł, L90 oferta/walidacja, inny kierunek audytu wycen bota).
- Każdy samodzielnie zielony krok osobnym commitem.

### E3. Domknięcie
- `npm test` + `npm run build` zielone; benchmark szybki jeśli były zmiany w bocie.
- Aktualizacja `docs/setup/HANDOFF_2026-09-05e.md` + `docs/PROJECT_HISTORY.md`.
- Opis PR zaktualizowany kumulatywnie.

## Ryzyka / pułapki

- Nie wymyślamy nowego batcha kart (ADR 0021 4c).
- Pełny B0 tylko na komendę (ADR 0018).
- Każdy commit pushowany od razu (ADR 0020 C/D); nigdy `--force`.
- Komunikaty commitów przez plik `/home/user/msg.txt` (ENVIRONMENT §4).
- Żywy Tester wymaga `npm run build` i `npm i` w `tools/table-tester`.

## Podsumowanie wykonania (uzupełnić na końcu)

- (uzupełnić)
