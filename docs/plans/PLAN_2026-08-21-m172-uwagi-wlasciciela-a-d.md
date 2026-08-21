# PLAN 2026-08-21 — M172: uwagi właściciela z testów (A, B, B2, C, D)

- **Sesja:** `arena/01a02534-mtg`, PR #69 (kontynuacja po M171).
- **Zgłoszenia właściciela (czat, 2026-08-21):** A (nazwy Gracz/Bot),
  B (tytuły rozdziałów Sagi w decyzji celu), B2 (badge czasowych zdolności),
  C (okno odpowiedzi obrońcy po deklaracji bloków), D (rozróżnialne kopie).

## Rozpoznanie (root cause)

- **A (doprecyzowane przez właściciela w czacie):** zmiana DOTYCZY WYŁĄCZNIE
  panelu informacyjnego na górze strony (wskaźnik tury, życie, zwycięzca) —
  tam „Ty"→„Gracz", „On"→„Bot" (+ baner „Koniec gry — wygrywa:", ta sama
  klasa informacji). Log, modale i warstwa odmiany 2. osoby BEZ zmian.
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

### Dodatkowe zgłoszenia w trakcie sesji (czat)

- **E (Inferno Titan — UX przydziału):** zamiast enumeracji kombinacji
  celów (33 opcje) — MODAL z listą kandydatów i stepperami +/− obrażeń
  (jak przydział obrażeń po walce); suma musi równać się total (3);
  cele = kandydaci z kwotą > 0 (to realizuje „among one, two, or three").
  UI skleja dwie komendy silnika: resolve_trigger_target { targetIds }
  → resolve_damage_division { amounts } (announce Z6 otwiera kwoty
  natychmiast po wyborze celów).
- **F (okno atakującego po blokach):** pokryte implementacją C — po
  passie obrońcy atakujący ma priorytet i normalne akcje przed
  resolve_combat (test C2).

## Etapy (osobne, samodzielnie zielone commity)

- [x] Etap 0: plan (79dcadf).
- [x] Etap A: panel górny + baner końca gry — Gracz/Bot (log bez zmian);
      testy table-ui zaktualizowane.
- [x] Etap C+F: okno odpowiedzi po blokach (CR 509.4) — priorytet dla
      obrońcy, potem atakującego; pass nie domyka rundy; oferta=walidacja
      (L48). Testy C1–C3 RED→GREEN; ~30 plików testów w przepływie CR;
      benchmark 9/9; żywa partia bez STOP (4d7037d).
- [x] Etap B+B2: saga.chapterNames (Mesmerize/Cold Snap) w danych,
      pending/zdarzenie/modal/log nazywają rozdział; fix L47 w identity.js
      (saga gubiła chapterNames); widok battlefield niesie cantBlock/
      cantBeBlocked/lostKeywordsUntilEOT (klasa L1/ADR 0017 — badge'e
      m168 liczyły z pól, których widok nie wysyłał). Testy B1/B2/B2b
      (609b1d6).
- [x] Etap D: copyNumber (nextCopyNumber po żywych kopiach nazwy);
      widok + kafel + etykiety celów + log „Nazwa (kopia N)". Testy D1/D2
      (bf3a481).
- [x] Etap E: renderDamageDivisionWizard (steppery, suma=total, cele =
      kwota>0, maks. 3), main skleja resolve_trigger_target +
      resolve_damage_division; panel „X — podziel N obrażenia między cele";
      tester obsługuje wizard (L12). Testy E1–E3 (30ec7db).
- [x] Zamknięcie: `test:all` 2613/2613, build 52 moduły / 2226.0 kB,
      dokumentacja + opis PR.

## Ryzyka / pułapki

- C zmienia przepływ walki — sprawdzić boty (benchmark regresji) i Żywego
  Testera (auto-pass obrońcy bez akcji), testy scenariuszowe walki.
- D: `name` obiektu bywa używany przez reguły (legend rule?) — numer
  kopii NIE zmienia `name` w silniku, tylko osobne pole `copyNumber`
  składane w warstwie prezentacji.
- Polskie znaki: edycje przez python3 (nie edit_file).

## Podsumowanie wykonania

Wszystkie zgłoszenia właściciela (A, B, B2, C, D, E, F) wdrożone w 6
commitach (8b9d81e, 4d7037d, 609b1d6, bf3a481, 30ec7db + plan 79dcadf).
Nowe testy: `test/m172-uwagi-wlasciciela.test.js` (11) + aktualizacje
table-ui i ~30 plików walki do przepływu CR 509.4. Stan końcowy:
`test:all` **2613/2613**, build **52 moduły / 2226.0 kB**, benchmark
regresji bota 9/9, żywe partie bez STOP i zgłoszeń detektorów.
