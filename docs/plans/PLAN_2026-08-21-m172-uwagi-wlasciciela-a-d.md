# PLAN 2026-08-21 — M172: uwagi właściciela z testów (A, B, B2, C, D)

- **Sesja:** `arena/01a02534-mtg`, PR #69 (kontynuacja po M171).
- **Zgłoszenia właściciela (czat, 2026-08-21):** A (nazwy Gracz/Bot),
  B (tytuły rozdziałów Sagi w decyzji celu), B2 (badge czasowych zdolności),
  C (okno odpowiedzi obrońcy po deklaracji bloków), D (rozróżnialne kopie).

## Rozpoznanie (root cause)

- **A:** panel górny pokazuje „Ty"/„On"; log używa PLAYER_NAMES
  (`Ty`/`Nieprzyjaciel`) + warstwy `odmienNaDrugaOsobe` (słownik DRUGA_OSOBA,
  klasa L29 — każdy nowy czasownik to dziura). Decyzja właściciela:
  Ty→Gracz, On/Nieprzyjaciel→Bot ⇒ wszystko w 3. osobie, warstwa odmiany
  do usunięcia. Zasięg: ~45 plików testów (mechaniczne `Nieprzyjaciel`→`Bot`),
  13 plików z formami 2. osoby, detektor `detectThirdPersonAboutHuman`
  (obsolete), tester (`extract`/`detectors` — wzorce „Ty ").
- **B:** `queueSagaChapter` buduje ability z `effect: []` → widok
  `pendingTriggerTarget.effectType` = null → tytuł „<karta> — cel triggera".
  Fix: dane rozdziałów dostają `chapterNames` (Oracle: Mesmerize/Cold Snap),
  pending niesie nazwę rozdziału + typ efektu celowanego; tytuł modala
  z etykietą efektu (słownik w render).
- **B2:** render MA badge „nie do zablokowania" (`cantBeBlockedNow`), ale
  playerView NIE wysyła pola `cantBeBlocked` (klasa L1/ADR 0017 — kontroler
  i render czytają widok, nie stan). Fix: `cantBeBlocked`/`cantBlock` w
  projekcji battlefield (informacja publiczna).
- **C:** `declare_blockers` handler skacze do `combat_damage` z priorytetem
  AKTYWNEGO — obrońca nie ma okna odpowiedzi po deklaracji bloków
  (CR 509.4; Dawntreader Elk nie zdążył aktywować zdolności). Fix:
  po deklaracji priorytet dla OBROŃCY; `pass_priority` w `combat_damage`
  dozwolone, dopóki nie domyka pełnej rundy (wtedy `combat_unresolved` —
  atakujący musi `resolve_combat`).
- **D:** token-kopia (`create_copy_token`, `resolve_enter_as_copy`) ma
  nazwę identyczną z oryginałem — nie do odróżnienia w celach/blokach.
  Fix: silnik nadaje kopii `copyNumber` (kolejny wolny numer wśród kopii
  o tej nazwie), widok go wystawia, warstwy nazw (kafel, cele, log)
  pokazują „Nazwa (kopia N)".

## Etapy (osobne, samodzielnie zielone commity)

- [ ] Etap 0: plan (ten plik) + push.
- [ ] Etap A: nazwy Gracz/Bot + usunięcie warstwy 2. osoby + aktualizacja
      testów i testera. Kryterium: `npm test` + build zielone.
- [ ] Etap C: okno priorytetu obrońcy po blokach (CR 509.4) + testy
      RED→GREEN (Dawntreader Elk aktywowalny po deklaracji bloku);
      benchmark regresji bota po zmianie przepływu walki.
- [ ] Etap B+B2: etykiety rozdziałów Sagi w decyzji celu + badge
      z pól `cantBeBlocked`/`cantBlock` w widoku; testy RED→GREEN.
- [ ] Etap D: numeracja kopii (`copyNumber` w silniku, „(kopia N)"
      w warstwach nazw); testy RED→GREEN.
- [ ] Zamknięcie: `test:all` + build, dokumentacja (PROJECT_STATE,
      handoff, opis PR).

## Ryzyka / pułapki

- A dotyka ~50 plików testów — commit po pełnym `npm test`, nie wycinku
  (L25: zmiana treści logu psuje odległe asercje).
- C zmienia przepływ walki — sprawdzić boty (benchmark regresji) i Żywego
  Testera (auto-pass obrońcy bez akcji), testy scenariuszowe walki.
- D: `name` obiektu bywa używany przez reguły (legend rule?) — numer
  kopii NIE zmienia `name` w silniku, tylko osobne pole `copyNumber`
  składane w warstwie prezentacji.
- Polskie znaki: edycje przez python3 (nie edit_file).

## Podsumowanie wykonania

(uzupełniane na końcu zadania)
