# PLAN 2026-08-25 — M204: audyt PR #75 + kontynuacja pętli jakości

- **Sesja:** `arena/01a0384b-mtg` (M204)
- **Tryb:** ADR 0020 (PR na starcie → audyt poprzedniego PR → inkrementalne commity)
  + ADR 0021 (prompt „kontynuuj" = pętla domyślna, bez pytania o kolejkę)
- **Baza zmierzona przed pracą:** `npm test` **3198/3198**, `npm run build`
  **54 moduły / 2637 kB**, gałąź na `9187fea` (squash PR #75).

## Kontekst

Poprzednia sesja M203 (PR #75, scalony jako `9187fea`) zostawiła:

1. **Otwarte znalezisko #3 pętli** — detektor [bot] „powtórzył akcję 4× w jednej
   turze" dla Unstable Frontier to fałszywy alarm. Zmierzone: po aktywacji `{T}`
   obiekt jest tapnięty i ofert jest 0 (CR 602.2). Commit `80bca30` usunął jedno
   źródło fałszywych alarmów (przedruki IDENTYCZNYCH bloków modala), ale alarm z
   seeda 61 zostaje: ta sama akcja trafia do kilku RÓŻNYCH renderów modala.
   Do rozstrzygnięcia: modal „Rozgrywka" pokazuje ponownie ten sam ruch po
   „Wznów grę bota" — błąd UI (gracz widzi duplikat) czy artefakt testera
   (wznawianie bez czyszczenia `botMoves`)?
2. **Cel „10 błędów" Żywym Testerem nieosiągnięty** — są 3 znaleziska
   (2 naprawione, 1 częściowo). Kolejne polowanie ma zacząć się od
   rozstrzygnięcia #3 i dłuższych partii z ręcznym czytaniem transkryptów.

## Etapy

### 0. Roadmapa i PR (ten commit)
- [x] Plan zapisany w `docs/plans/`.
- [x] PR #76 otwarty z tytułem i opisem.
- Kryterium: gałąź na GitHubie, PR widoczny.

### 1. Audyt PR #75 (ADR 0020 B)
- [ ] Przegląd każdego zmienionego pliku z `gh pr diff 75` (z płaskiego
  squasha `9187fea`): Halo Forager, konwencja `prezentacja = enumeracja`,
  układ stołu, poprawki testera (kreator celów wielokrotnych), wygnanie
  zakryte w logu, detektor przedruków modala.
- [ ] Weryfikacja: brak specjalnych przypadków po nazwie/ID karty w core
  (ADR 0002), brak globali Node w kodzie przeglądarkowym (L58), pełny Oracle
  kart `supported` (ADR 0022).
- [ ] `npm test` + `npm run build` zielone na bazie.
- [ ] Raport w `docs/audits/AUDYT_PR75_2026-08-25.md`, wnioski w opisie PR.

### 2. Znalezisko #3 — duplikat ruchu bota w modalu
- [ ] Odtworzenie (Żywy Tester, talia z Unstable Frontier, `--steps` 400+).
- [ ] Diagnoza: czy `botMoves` jest czyszczone po „Wznów grę bota"? Czy modal
  kumuluje wpisy z kolejnych renderów?
- [ ] Decyzja: naprawa u root cause (UI sesji czy tester), test regresyjny
  (RED→GREEN), aktualizacja detektora jeśli potrzeba.
- [ ] Kryterium: seed 61 bez fałszywego alarmu; `npm test` zielony.

### 3. Dalsze polowanie Żywym Testerem (cel: kolejne błędy)
- [ ] Dłuższe partie (≥400 kroków), różne pary talii jednoplanowych, ręczne
  czytanie transkryptów po trzech osiach z `TESTER_STOLU.md`:
  (1) bezsensowne działania bota, (2) kompletność logu/modala,
  (3) ptaszki auto-pass przy czarach/zdolnościach.
- [ ] Każde znalezisko: objaw z transkryptu → naprawa u root cause →
  test regresyjny → nowy detektor jeśli klasa powtarzalna.
- [ ] Kryterium: `npm test` + build zielone po każdym samodzielnym kroku.

### 4. Zamykanie sesji
- [ ] `docs/PROJECT_STATE.md` zaktualizowany.
- [ ] `docs/setup/HANDOFF_2026-08-25-m204.md` z wynikami i kolejką.
- [ ] Opis PR #76 kumulatywnie (co commit, wyniki testów/builda, benchmark).
- [ ] `git status` czysty, wszystko wypchnięte.

## Ryzyka i pułapki

- **Reset workspace w trakcie sesji** — commituj/pushuj po każdym kroku
  (ADR 0020 D, procedura odzyskiwania w `ENVIRONMENT.md` §2).
- **`GH_TOKEN` wygasa** — push po reconnect w Arenie, nigdy nie proś o token.
- **Egress HTTPS zablokowany** (poza npm rejestrem) — dane kart z Scryfalla
  przez `fetch_page`, nie `curl`/`fetch` w Node.
- **Polskie znaki w `edit_file`** — używaj `python3` z `pathlib` (UTF-8).
- **Pełny B0 tylko na komendę właściciela** (ADR 0018) — benchmark domyślnie
  profil szybki (`node tools/benchmark.mjs`, ~2–4 min).
- **Samodzielnie zielony = cały pakiet** (`npm test`, nie wycinek).
