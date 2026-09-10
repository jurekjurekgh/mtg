# PLAN 2026-09-10 — Sesja arena/01a08b81: audyt PR #111 + pętla jakości

> Roadmapa JEDNEGO zadania (uzupełnienie handoffu, nie zamiennik). Prompt startowy:
> „kontynuujemy projekt" — brak nazwanego tematu, więc po audycie obowiązuje
> pętla domyślna ADR 0021.

## Stan wyjściowy (zmierzony, nie z handoffu — L7)

- `git log`: HEAD = `1aa061a3` („Sesja arena/01a08788: audyt PR #109 + pętla
  jakości (#111)") — merge commit PR #111 = baza tej gałęzi.
- `npm test` (szybki rdzeń): **5055/5055** zielone (~140 s).
- `npm run build`: 61 modułów, **3453,7 kB** — zgodne z handoffem 2026-09-10.

## Cel sesji

1. **Audyt poprzedniego scalonego PR #111** (ADR 0020 B / ADR 0016): przegląd
   każdego zmienionego pliku (5 plików `src/` + 5 plików testów + 9 plików docs)
   pod kątem logiki, zgodności z CR MtG i ADR 0002 oraz RED→GREEN testów
   (weryfikacja mutacyjna — L13). Wynik w `docs/audits/AUDYT_PR111_2026-09-10.md`
   i w opisie PR tej sesji. Audyt porównuje stan projektu na starcie PR #111
   ze stanem po jego scaleniu — nie jest streszczeniem diffa (uwaga AGENTS.md).
2. **Pętla jakości** (ADR 0021): Żywy Tester z perspektywy gracza (trzy osie
   z TESTER_STOLU.md), znalezione błędy naprawiane u root cause z testami
   regresji + nowe detektory; polowanie na niezgodności z CR ścieżkami innymi
   niż poprzednia sesja. Karty: NIE dodajemy nowych (ADR 0029, ADR 0021 c).

## Etapy i kryteria ukończenia

- [x] E0. Rozpoznanie: lektura obowiązkowa (AGENTS.md, ADR 0001–0030, LESSONS.md
      L1–L141, ENVIRONMENT.md, handoff 2026-09-10), pomiar bazy
      (`npm test` 5055/5055, `npm run build` 61/3453,7 kB).
- [x] E1. PR #112 na GitHubie PRZED kodowaniem (ADR 0020 A) + ten plan jako
      osobny commit (`210aaad`).
- [x] E2. Audyt PR #111 — przegląd diff plik po pliku (logika, CR, ADR 0002,
      kompletność PlayerView przy zmianach widoku, FoW). Wynik:
      `docs/audits/AUDYT_PR111_2026-09-10.md` — 3 znalezione problemy (F1–F3).
- [x] E3. Weryfikacja mutacyjna fixów z PR #111 (L13): F-A/F-B/F-C/F-D — RED po
      cofnięciu każdej naprawy; M260/F1 i M348 — ZIELONO po cofnięciu (brak
      strażników). Tabela mutacji w audycie.
- [x] E4. Zamknięcie audytu: commit audytu + aktualizacja opisu PR #112.
- [x] E4b. Naprawa znalezisk audytu — każdy RED→GREEN, osobny commit:
      - F1 `57ee498`: 3 testy Thunderstaffa w batch51 (mutacja RED: 2 z 3),
      - F2 `6147b09`: test/m348-odrzucenia-etykiety.test.js (mutacja RED: 3 z 5),
      - F3 `23bf9f2`: guard `!hiddenFromViewer` (2 linie) + test
        nierozróżnialności face-down (RED przed guardem: 2 z 3).
      Bramka po całości: `npm test` **5066/5066**, build 61 modułów / 3454,1 kB.
- [x] E4.5 (zlecenie właściciela, PRIORYTET): 5 bugów rozgrywki, commit po
      jednym — zakończone 2026-09-10:
      - A `00e4cb3`: nagłówek tury przeciwnika nie znika (streamAutoEvents
        tylko BOT zdarzenia + apply() czyści jedynie bufor już-pokazany, M261);
        test/bug-a-pauza-naglowek-tury.test.js (3), mutacje zweryfikowane.
      - B `03feae2`: Dismal Backwater w kreatorze many z kolorami (mostek
        abilityInfo(id,null)→pełny stan; bez mapowania w MANA_SOURCE_MAP —
        guard M193); test/bug-b-dismal-backwater-kreator.test.js (3).
      - C1 `1a6f407`: Fireball — warianty niosą `cost` (X+{R}+{1}/cel ponad
        pierwszy), etykieta i kreator celów pokazują łączny koszt przed
        zatwierdzeniem (rozliczenia silnika były zgodne z CR — brakowało
        widoku); test/bug-c1-fireball-koszt-widoczny.test.js (3).
      - C2 `423ccb8`: panel „Twoje działania” bez licznika „(N opcji)”
        (choiceGroupLabel = sam tytuł; optionsCountLabel usunięte);
        test/bug-c2-licznik-opcji-panel.test.js (2) + piny zaktualizowane.
      - D `ab6daf2`: hover Day/Night — revive na mousemove domyka szczelinę
        mouseenter po przebudowaniu kafla pod kursorem (klik działał, hover
        nie); test/bug-d-daynight-hover-revive.test.js (4), mutacje 2/2.
      Bramka po całości: `npm test` **5081/5081**, build 61 modułów / 3460,7 kB.
      Opis PR #112 zaktualizowany (gh api PATCH — `gh pr edit` odrzuca
      Projects classic).
- [ ] E5. Pętla jakości Żywym Testerem: partie świeżych seedów, triaż osi 1–3,
      znalezione błędy: repro → fix u root cause → test regresji → re-run.
      Kryterium: każdy fix ma test RED→GREEN i re-run partii 0 zgłoszeń.
- [ ] E6. Domknięcie sesji: `npm test` + `npm run build` zielone, handoff
      2026-09-10b, PROJECT_HISTORY, kumulatywny opis PR, checklista
      ENVIRONMENT §7.

## Kolejność commitów

1. plan (ten plik),
2. audyt PR #111 (docs/audits/ + opis PR),
3. kolejne samodzielnie zielone kroki pętli jakości (osobno per finding).

## Ryzyka i pułapki

- **Nie robić pełnego B0** (ADR 0018) — tylko szybki profil, jeśli zmiany dotkną
  bota/wycen; próg regresji bez pełnej macierzy zostaje bez zmian.
- Tester mierzy `dist/` — po każdej zmianie `src/` najpierw `npm run build` (L76).
- `gh pr edit` bywa odrzucane (GraphQL Projects) → opis przez `gh api PATCH`
  (ENVIRONMENT §3).
- Polskie znaki w plikach — `write_file`/python3 UTF-8, nie `edit_file` na ślepo.
- Audyt bez wymyślania błędów na siłę (ADR 0027 konsekwencje, L57): znajdowanie
  rozbieżności z CR wymaga cytatu źródła (ADR 0030), pamięć treningowa nie jest
  źródłem.
- Zmiany regułowe tylko z dosłownym tekstem CR/rulingów pobranym z sieci;
  bez sieci — adnotacja „do weryfikacji u źródła", bez fixa (ADR 0030 §5).
