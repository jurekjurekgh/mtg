# PLAN 2026-10-21 — kontynuacja: audyt PR #168 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt.” Brak nazwanego tematu → ADR 0020/0021:
PR sesji → audyt poprzedniego PR → niedokończony plan z `main` → pętla jakości.
Bez samowolnego dodawania kart (ADR 0029), bez pełnego B0 (ADR 0018).

**Gałąź:** `arena/4129dd32-mtg`, baza `main` @ `0ef7be9` (scalony PR #168).
**Lektura:** AGENTS §0, ADR 0001–0030, LESSONS, ENVIRONMENT, PR #168 (diff),
najnowszy handoff 2026-10-18 (UWAGA: sporządzony w środku PR #168, zdezaktualizowany
przez późniejsze commity PMSSB i batch 69 — fakty sprawdzać w repo i PR).

## Rozpoznanie przed kodowaniem

- `git status`: czysto; `gh pr list`: #168 scalony, brak otwartych PR.
- PR #168: 130 zmienionych plików, 5485 dodanych / 359 usuniętych linii;
  w tym silnik, bot, UI, batch 69 (10 kart), talie, testy i dokumentacja.
  Diff zapisany tylko roboczo w `.arena/pr168.diff` (nie commitować).
- `npm test` na bazie: 8611/8611 rc=0 (134,6 s); `npm run build`: rc=0,
  74 moduły, 5285,0 kB. Testy pełne na koniec PR.
- Ostatni plan w repo, PMSSB-77, opisuje tokeny wroga jako „poza zakresem”,
  choć późniejszy commit PR #168 je uwzględnił: przy przeglądzie rozstrzygnąć
  rozbieżność dokumentacji ze stanem kodu. Nie brać backlogu za kolejkę.

## Etapy i planowane oddzielne commity (kolejno, każdy zielony + push)

0. [x] **Plan i PR:** ten dokument jako osobny commit (testy + build), push,
   `gh pr create --base main --head arena/4129dd32-mtg`; PR musi istnieć przed
   jakimkolwiek kodowaniem (ADR 0020 A).
1. [x] **Audyt techniczny PR #168:** przejść KAŻDY ze 130 plików diffu.
   W osobnych grupach: (a) reguły silnika, mana i convoke, stan i FoW;
   (b) karty batcha 69 — 10 snapshotów Oracle/rulingi, definicje i talie;
   (c) bot: wycena, kontrakty widoku, deterministyczność, koszt i płatność;
   (d) UI, tester, narzędzia, nowe i zmienione testy, fixture;
   (e) dokumentacja, zgodność planów/handoffu/PR z aktualnym stanem.
   Dla testów RED→GREEN sprawdzić niezależność oczekiwań od implementacji
   i selektywne mutacje/repro. Przy zmianie reguł pobrać dosłowne CR/rulingi
   online przed poprawką (ADR 0030); gdy źródło niedostępne — nie zgłaszać
   niepotwierdzonego błędu reguł. Zapisać w `docs/audits/AUDYT_PR168_2026-10-21.md`
   ustalenia, zakres, dowody i status każdego znaleziska; opis PR uzupełnić.
2. [x] **Każdy wykryty błąd:** osobny mały krok: repro/test RED → naprawa
   u root cause (nie wyjątek po nazwie karty) → test GREEN i mutacja/anty-over-fix
   → `npm test` + build → commit i push. Dokumentacja audytu aktualizowana
   razem z naprawą; nie mieszać kilku niezależnych fixów w jeden commit.
3. [x] **Niedokończony plan i pętla jakości:** zweryfikować status planów z `main`;
   skorygować zdezaktualizowany PMSSB-77 oraz margines budżetu lektury
   (~100k, bez podniesienia progu; skrócić redundantną prozę, zachować reguły
   i nagłówki LN). Uruchomić Żywego Testera na świeżym `dist/`, przeczytać
   transkrypty ręcznie w trzech osiach (bot, log/modal, auto-pass), poprawić
   wykryte błędy + dodać detektor; celowane polowanie na niezgodności CR inną
   ścieżką niż w #168, z repro i źródłami. Oddzielne zielone commity.
4. [x] **Domknięcie:** `npm run test:all` cicho do ignorowanego logu,
   `npm run build`, `node tools/cr-numery.mjs --sprawdz`, kontrola `git diff` i
   zgodności `origin/main`; uaktualnić `docs/PROJECT_HISTORY.md`, nowy handoff,
   podsumowanie tego planu i kumulacyjny opis PR. Push bez force; PR do decyzji
   właściciela, NIE scalać.

## Ryzyka i kontrola

- PR #168 był wyjątkowo duży, więc audyt obejmuje również postęp po starym
  handoffie. Same zielone testy nie dowodzą poprawności Oracle ani jakości bota.
- Engine/view/bot nie mogą rozgałęziać się po nazwie karty (ADR 0002/0017);
  dane kart i talie muszą pochodzić od właściciela (ADR 0029).
- Nie powtarzać limitu 100 stworów O-2 (decyzja właściciela: pozostawić).
  Przy zewnętrznym egressie poza GitHub/npm korzystać z narzędzia fetch_page;
  brak źródła = brak zmiany regułowej (ADR 0030).
- Testy fast/slow/all ZAWSZE do `.arena/*.log` z zachowaniem exit code,
  nie wypisywać pełnego logu; tester czyta `dist/`, więc przed nim build.
- Każdy push: status/HEAD, fetch i porównanie z origin. Tylko nowe commity na
  przypisanej gałęzi (ADR 0020 D). Żadnego merge bez decyzji właściciela.

## Podsumowanie wykonania

- **Krok 0:** plan `7549016`, PR #169 otwarty przed pierwszą zmianą kodu.
- **Krok 1:** zweryfikowano wszystkie **130** ścieżek diffu #168 (inwentarz,
  grupy i ustalenia w `docs/audits/AUDYT_PR168_2026-10-21.md`). Baza 8611/8611.
- **Krok 2:** A-1…A-10: convoke (płatność, kolory, wydajność), riot przed ETB,
  ponowne objęcie inicjatywy, przydział blokerów, źródła pipów zdolności,
  atomowa aktywacja Bloodfire, dostępne przyciski podglądu i nagłówek clash,
  realny koszt kolorowy Bloodfire/outlast oraz strażnik riot — oddzielne
  komity RED→GREEN. A-11/A-13: erraty historycznych opisów inicjatywy
  i riot (`3308405`, `e16ce2f`). A-12 `1dcc9ad`: dobrowolne convoke przy
  dostępnej manie (CR 702.51a); golden diff 0 wybranych ruchów, limit 64
  pozostaje świadomą granicą UI. Korekta PMSSB-77 `3a6d6eb` oddziela
  pierwszą iterację od finalnej symetrii. Szczegóły i piny w audycie.
- **Krok 3:** 13 wpisów LESSONS skondensowanych z kopią w archiwum (`e8a3f67`),
  pomiar ~98 466/100k. Żywy Tester: 4 partie na artefakcie do końca,
  0 zgłoszeń/nieocenionych ruchów; pełne transkrypty (~1300 linii)
  przeczytane w osiach bot, log/modal, auto-pass. Ręcznie znaleziono Q-1:
  żywy log nazywał `living_weapon` „bestow”; RED 1/3, fix po `via`, test
  GREEN 3/3, focused 47/47, `npm test` 8663/8663, build; powtórna partia
  na świeżym `dist/` pokazała właściwy opis (commit `d8e324e`). Stun poza
  diffem #168: CR 122.1d + rulings, celowane piny 46/46, bez nowej
  rozbieżności. Nie uruchamiano pełnego B0.
- **Krok 4:** historia, nowy handoff, README i opis PR #169; końcowe
  `npm run test:all` **8930/8930**, build **75 modułów / 5308,1 kB**,
  `dokumentacja-budzet-lektury` **2/2** (~98 466/100 000),
  `cr-numery --sprawdz` **OK**, `git diff --check` OK. `origin/main`
  nadal `0ef7be9` po `git fetch` (ta sama baza, bez potrzeby rebase).
  PR #169 pozostaje otwarty do decyzji właściciela, bez merge; jego opis
  uzupełniany wraz z końcowym pushem dokumentacji.
