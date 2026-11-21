# Plan sesji 2026-11-21 — Audyt PR #188 i pętla jakości (ADR 0020 / ADR 0021)

- **Gałąź sesji:** `arena/03166ca3-mtg`
- **Baza (`main`):** `1dff7d2c5710ad28311b2c0ed4200f386a90408e` (scalenie PR #188)
- **Tryb:** ADR 0020 (PR na starcie → pełny audyt PR #188 → inkrementalne commity) +
  ADR 0021 (pętla jakości przy braku wskazania konkretnego zadania w prompcie
  „Kontynuujemy projekt.” — nie wymyślam nowego batcha kart; karty tylko z listy
  właściciela lub z niedokończonego planu; kolekcja kończy się na 665 = Batch 74
  zamknięty w PR #187).

## Rozpoznanie bazowe (zweryfikowane na `1dff7d2`)

- PR #188 (`arena/c2635cc8-mtg`, scalony 2026-11-21 21:42 UTC) to **7 plików
  (+385/−0)**: audyt PR #187 (`docs/audits/AUDYT_PR187_2026-11-21.md`,
  `PR187_MAPA_PLIKOW_2026-11-21.md`), plan sesji, handoff, wpis
  `docs/PROJECT_HISTORY.md` oraz JEDYNA zmiana kodu: `src/table/render.js`
  (+5: wpis `instants_and_sorceries_in_your_graveyard` w `DYNAMIC_AMOUNT_NOUNS`)
  i nowy test `test/audyt-pr187-raw-slug-blitz.test.js` (+90).
- Znalezisko było z pętli jakości (Żywy Tester, 14 partii): surowy slug
  `instants_and_sorceries_in_your_graveyard` w kaflu „Blitz of the Thunder-Raptor”
  (IKO) zamiast treści — root cause: brak wpisu w `DYNAMIC_AMOUNT_NOUNS`,
  `describeEffect` wracała do `dynamicAmount` zwracającego surowy slug.
- Raportowane bramki PR #188: `npm test` 10 543/10 543, `slow` 282/282,
  `test:all` **w toku** (`.arena/test-all-final.log` — status niepotwierdzony
  w handoffzie), build 79 / 5988.3 kB, `cr-numery` OK, `bot-tie-audit --gry=2` RC=0.
- **Baseline tej sesji (zmierzony):** `npm test` **10 543/10 543, fail 0**,
  `npm run build` **79 modułów / 5988.7 kB, EXIT 0** (`1dff7d2`).
- Kolekcja właściciela kończy się na 665 — **żadnego nowego batcha kart**
  (ADR 0029, ADR 0021 pkt 4c).

## Etapy pracy i kolejność commitów

### E0. Plan i PR na starcie (ADR 0020 A) — ten commit
- [x] Spisanie planu w `docs/plans/PLAN_2026-11-21-audyt-pr188-i-petla-jakosci.md`.
- [x] Push gałęzi `arena/03166ca3-mtg` i otwarcie PR na GitHubie PRZED jakimkolwiek
  kodowaniem (PR może na starcie zawierać tylko ten plan).

### E1. Audyt techniczny PR #188 (ADR 0020 B / ADR 0016)
- [x] Inwentarz 7/7 plików (`gh api pulls/188/files --paginate` vs
  `^diff --git ` w `gh pr diff 188`; L190) → `docs/audits/PR188_MAPA_PLIKOW_2026-11-21.md`.
- [ ] Przegląd zmiany kodu `src/table/render.js` (`DYNAMIC_AMOUNT_NOUNS`):
  logika wpisu, brzmienie frazy, brak wyjątków po nazwie karty (ADR 0002),
  kompletność — czy SŁUGA inne surowe slugi kwot czają się w katalogu
  (skan `amount:`/`slug` w `card-data.js` wobec mapy NOUNS i detektora).
- [ ] Test `test/audyt-pr187-raw-slug-blitz.test.js`: RED→GREEN — mutacja
  (usunięcie wpisu z NOUNS) musi czerwienić; sprawdzenie, czy test mierzy
  naprawę, nie tekst (L5, L13); czy nie maskuje innych slugów (L13: pin
  pozytywny `tyle obrażeń, ile …` obok negatywnego).
- [ ] Weryfikacja dokumentów PR #188 (audyt/plan/handoff/history) — liczby
  z pomiaru, nie przepisane (L56/L92); baseline `npm test` 10 543/10 543
  potwierdzony powyżej.
- [ ] Potwierdzenie bramek `test:all` (brama PR, ADR 0019) — poprzednia sesja
  zostawiła je „w toku”; uruchomić w tle i zweryfikować.
- [ ] Raport `docs/audits/AUDYT_PR188_2026-11-21.md` + wpis do `PROJECT_HISTORY.md`;
  znalezione błędy naprawiane od razu (osobny commit, RED→GREEN).

### E2. Pętla jakości (ADR 0021 pkt 4a/4b)
- [x] (a) Żywy Tester `tools/table-tester/run-game.mjs` z perspektywy gracza
  (`npm i` w `tools/table-tester`, `npm run build` przed biegiem — L76):
  świeżne pary talii, osie audytu wg `TESTER_STOLU.md`; naprawy u root cause
  + nowe detektory, gdy klasa błędu się powtórzy (L27).
- [ ] (b) Polowanie na niezgodności z CR **inną ścieżką niż poprzednie sesje**
  (poprzednie: kontrakty zdarzeń, numery CR, remisy bota, slugi w kafle) —
  kandydat kontynuujący E1: kompletność mapy surowych slugów kwot
  (rodzina M122 / `DYNAMIC_AMOUNT_NOUNS`) + skan podobnych „dynamicznych"
  pól w kaflu po całym rejestrze. **WYKONANE:** enumeracja 11 kwot
  `amount:` (kompletność map — §1.2 audytu) + klasowy test
  `test/surowy-slug-kafel-katalog.test.js` (726 kart, dwie warstwy,
  mutacje RED/GREEN na obu). Żywy Tester: 23 partie, 0 zgłoszeń,
  0 defektów (§4a audytu).
- [x] Bramy po każdym kroku: `npm test` (cicho, `.arena/`) + `npm run build`
  — zielone przed każdym commitem (10 543 → 10 546 testów).

### E3. Domknięcie sesji
- [ ] `npm run test:all` (pełna brama PR, cicho, `.arena/test-all.log`).
- [ ] Odświeżenie „bieżącego stanu” NA KONIEC sesji (L92): README/handoff
  liczbami z pomiaru.
- [ ] `docs/setup/HANDOFF_<data>.md` + wpis `PROJECT_HISTORY.md` + opis PR
  kumulacyjnie; blok przekazania w czacie (ADR 0013 pkt 2).

## Ryzyka / pułapki

- Sandbox: klon ma projekt jako jeden commit — audyty PR przez `gh api`/`gh pr diff`
  (L190), nie `git log`.
- Testy wyłącznie z przekierowaniem do `.arena/` (ENVIRONMENT §5a); żadnego
  pełnego wyjścia do czatu.
- `edit_file` psuje polskie znaki → edycje docs przez `python3` (UTF-8).
- Brak decyzji właściciela w zakresie: żadnych nowych kart, żadnego pełnego B0
  (ADR 0018), żadnych zmian architektury.
