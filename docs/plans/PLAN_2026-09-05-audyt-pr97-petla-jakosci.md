# Plan sesji 2026-09-05 (arena/01a0712d): audyt PR #97 + pętla jakości

## Kontekst

- Baza: `5fb7994` (squash PR #97 — audyt PR #96 + gruntowy audyt Batcha 53).
- Prompt startowy: „kontynuujemy projekt" → ADR 0021 (pętla domyślna, bez pytania
  o kolejkę): PR → audyt poprzedniego PR → pętla jakości.

## Etapy

### E1. PR na start (ADR 0020 A) — commit planu, push, otwarcie PR
- Kryterium: gałąź `arena/01a0712d-mtg` na GitHubie + PR otwarty z planem audytu.

### E2. Audyt PR #97 (ADR 0020 B / 0016)
- Przegląd wszystkich 21 plików diffu (`d67b684..5fb7994`): logika, CR/Oracle
  (snapshoty `docs/cards/scryfall-*.json`), generyczność (ADR 0002), testy
  RED→GREEN.
- Pomiar bazowy: `npm test` (oczek. 4447/4447), `npm run build` (59/3265,2 kB),
  `node --test test/bot-benchmark.test.js` (oczek. 10/10).
- Kontrola mutacyjna wyrywkowa: F1 (pipy Óina), A1 (strefa refleksu),
  C-FIX-2 (próg ewazji w simie bota).
- Raport: `docs/audits/AUDYT_PR97_2026-09-05.md` + sekcja w opisie PR.
- Kryterium: raport zcommitowany; ewentualne znaleziska F* mają repro.

### E3. Pętla jakości — pozycje z handoffu 2026-09-05 (ADR 0021 §4)
1. **`wasKicked` LKI** (raport O6 PR #96, potwierdzony w handoffie jako
   kandydat): najpierw REPRO/test RED; jeśli luka potwierdzona — fix według
   wzorca F3 (`printLki`/`sourceLki` na stubie) + mutacja. Jeśli NIE
   potwierdzona — zanotować w raporcie dlaczego (test dowodowy, nie opinia).
2. **L47 dryfuje** (`copyableKeys` nie istnieje w kodzie, listy per-ścieżka):
   korekta treści lekcji do stanu faktycznego (grep + skan ścieżek kopiowania);
   bez zmiany numeru L47 (kotwice w kodzie).
3. **Sheriff z plotu**: zweryfikować, czy test „rzut z exile w późniejszej
   turze" (real-cards-batch53) zamyka lukę z handoffa; jeśli tak — odnotować
   w audycie jako zamknięte, nie dublować testu.
4. **Żywy Tester** na przebudowanym `dist/` (2 partie, detektory + ręczna
   oś czytania transkryptu wg TESTER_STOLU.md); znaleziska → naprawy u root
   cause z mutacjami.

### E4. Domknięcie sesji
- README (liczby ze ŚWIEŻEGO pomiaru — L92), PROJECT_HISTORY, handoff
  `HANDOFF_2026-09-05b.md`, aktualizacja opisu PR.
- Kryterium: `npm test` + `npm run build` zielone, push, czysty `git status`.

## Ryzyka / pułapki

- Równoległe edycje tego samego pliku gubią zmiany (handoff 2026-09-05) —
  edycje sekwencyjne + weryfikacja grepem.
- REPLACE po pierwszym wystąpieniu zduplikowanego stringu w card-data.js
  (wpadeka tej sesji podczas mutacji F1): zawsze kotwicz kontekst w komentarzu.
- Żywy Tester mierzy `dist/` — rebuild przed pomiarem (L76).
- Zakaz: pełne B0, nowe karty z inwencji, force push (ADR 0018/0021/0020 D).

## Kolejność commitów (plan)

1. `PLAN_2026-09-05-audyt-pr97-petla-jakosci.md` (+ otwarcie PR).
2. `docs/audits/AUDYT_PR97_2026-09-05.md`.
3. E3.1 repro+fix `wasKicked` (jeśli potwierdzone).
4. E3.2 korekta L47.
5. E3.4 naprawy z Żywego Testera (jeśli będą).
6. Dokumentacja domknięcia (README/handoff/PROJECT_HISTORY).

## Podsumowanie wykonania (uzupełnić na końcu)

- (uzupełnić)
