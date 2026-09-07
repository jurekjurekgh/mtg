# Plan sesji arena/01a07c4e — audyt PR #104 i pętla jakości

Data: 2026-09-07. Prompt właściciela: „kontynuujemy projekt" → ADR 0021:
PR na starcie (ADR 0020 A) → audyt poprzedniego scalonego PR (ADR 0020 B,
tu **#104** scalonego 2026-09-07 14:38 UTC jako `9da8b88`) → pętla jakości
(ADR 0021 pkt 4). Bez nowych kart (ADR 0029), bez pełnego B0 (ADR 0018).

## Baza (stan na starcie sesji, zmierzone)

- `main` = `9da8b88` (squash PR #104). Gałąź sesji: `arena/01a07c4e-mtg`.
- `npm test`: **4695/4695**. `npm run build`: **59 modułów / 3369,8 kB**
  — zgodnie z `HANDOFF_2026-09-07e.md`.

## E1. Audyt PR #104 (przed implementacją)

Zakres: 36 plików diffu (`gh pr diff 104`), ~2250+/146−. Obszary:

- [x] lektura diffu wszystkich 36 plików (engine: effects/game-state/
      state-based/tokens; bot; table/main+session; tester; narzędzie rulingów;
      16 testów; dokumenty).
- [x] weryfikacja regułowa w CR MtG: M339 (CR 708.6 FoW numeracji cloaków),
      M340 (CR 702.37e manifest z procedurą morpha), M341 (CR 104.4b/120.7),
      M342 (obrót ≠ ETB, ruling 2024-02-02), M343 (CR 704.3/704.4/704.5d —
      brak okna SBA podczas rozstrzygania czaru), M345 (ADR 0028),
      M346–M348 (tester: kolejność DOM, koszty dodatkowe, runtime errors).
- [x] weryfikacja testów RED→GREEN: 11 prób mutacyjnych na testach #104
      (każdy nowy test ma paść po cofnięciu fixu — L13; mutacje przez
      kopię pliku + `finally`, nie `git checkout` — L136).
- [x] `npm test` + `npm run build` na `main` (bazowe wyniki zmierzone).
- [x] Kryterium ukończenia: `docs/audits/AUDYT_PR104_2026-09-07.md` —
  36/36 plików, 11 mutacji 10/10 fixów RED→GREEN (2 nieważne probe'y
  powtórzone celowanie), zero błędów do naprawy.

## E2. Naprawy z audytu (jeśli audyt coś znajdzie)

- [x] audyt nie wykazał błędów wymagających naprawy (raport §5: wnioski
      wyłącznie potwierdzające; jedna notatka obserwacyjna o duplikacie
      raportu na granicy przycięcia logu testera — bez klasy, bez naprawy).
- Kryterium: n/d — brak napraw do commitowania; bramki bazy zielone.

## E3. Pętla jakości (ADR 0021), dopóki właściciel nie wskaże innego tematu

- [ ] audyt Żywym Testerem z perspektywy gracza (kilka partii, różne
      profile, zawsze stderr + detektory; `npm run build` przed testerem —
      L76), naprawy u root cause + nowe detektory tam, gdzie ręczne
      znalezisko.
- [ ] polowanie na niezgodności z CR inną ścieżką niż sesja #104 (nie
      powtarzać detektorów M346–M348).
- [ ] nie wymyślać batcha kart; katalog rośnie wyłącznie z listy właściciela.

## E4. Zamknięcie sesji

- [ ] README „Bieżący stan" zmierzone na końcu (L92), historia sesji w
      `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-07f.md`,
      opis PR kumulacyjnie, instrukcja przekazania w czacie.
- Kryterium: wszystkie commity wypchnięte, CI zielone, agent nie scala.

## Ryzyka i pułapki (z LESSONS/ENVIRONMENT)

- Budżet lektury startowej 99 904/100 000 — nowy wpis w LESSONS wymaga
  kondensacji innego, NIE podnosimy progu.
- `git checkout` cofa niezacommitowane poprawki (L136/L8); mutacje testowe
  przez kopię `cp` + `finally`.
- Tester mierzy `dist/` (L76); build przed każdym pomiarem.
- Pełny B0 wyłącznie na komendę właściciela (ADR 0018); audyt potwierdza
  `npm test` + `node --test test/bot-benchmark.test.js`.
- Etykiety (koszt) rozstrzygać po znaczeniu, nie po spacjach (M347).

## Podsumowanie wykonania (uzupełniane na końcu sesji)

- (do uzupełnienia po E4)
