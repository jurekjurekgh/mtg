# PLAN 2026-10-23 — kontynuacja: audyt PR #171 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt.” Brak nazwanego tematu → obowiązuje pętla
domyślna wg ADR 0020 i ADR 0021:
1. Otwarcie PR sesji z planem przed kodowaniem (ADR 0020 A).
2. Pełny audyt poprzedniego scalonego PR #171 (ADR 0020 B / ADR 0016) — wszystkie
   71 zmienionych plików i 31 commitów (`174871a..9dd6404`), ze szczególnym
   naciskiem na commity `4fa1b9b..9dd6404`, które weszły po ostatnim handoffie
   `HANDOFF_2026-10-21e.md`.
3. Sprawdzenie niedokończonych planów na `main` (ADR 0021 pkt 3).
4. Pętla jakości (ADR 0021 pkt 4): Żywy Tester z perspektywy gracza + polowanie
   na niezgodności z CR / lukami kontraktu widoku, bez samowolnego dodawania
   kart (ADR 0029) i bez pełnego B0 (ADR 0018).

**Gałąź:** `arena/6f1bfb96-mtg`, baza `main` @ `3fe3638` (squash-merge PR #171
z 2026-10-23 22:17:59 UTC).
**Lektura wykonana przed planem (`AGENTS.md` §0):** `AGENTS.md`, `docs/decisions/README.md`
oraz wszystkie ADR 0001–0030, `docs/LESSONS.md` (w całości, L1–L187),
`docs/setup/ENVIRONMENT.md`, PR #171 (lista plików, commity, diff 8129 linii),
najnowsze handoffy `HANDOFF_2026-10-21{c,d,d2,e}.md`.

## Rozpoznanie przed kodowaniem

- `git status`: drzewo czyste na `arena/6f1bfb96-mtg` @ `3fe3638`.
- **Stan bazowy zmierzony na `3fe3638`:**
  - `npm test` (fast): **8727/8727** pass, 0 fail (~122,6 s);
  - `npm run test:slow`: **268/268** pass, 0 fail (~329,8 s);
  - łącznie `test:all`: **8995/8995** pass;
  - `npm run build`: **75 modułów / 5372,2 kB**.
- **Wstępna obserwacja dokumentacyjna na `main`:** PR #171 zawierał 31 commitów
  z kilku tur (`2026-10-21c` .. `2026-10-23`), z czego ostatnie ~15 commitów
  (`4fa1b9b..9dd6404`) nie odświeżyło `README.md`, `docs/PROJECT_HISTORY.md`
  ani końcowego handoffu (`HANDOFF_2026-10-21e.md` podaje 8942 testy i 5322,4 kB).
- **Niedokończone plany na `main` (ADR 0021 pkt 3):** skan `docs/plans/PLAN_2026-10-*.md`
  wykazał wyłącznie historyczne pozycje czekające na weryfikację właściciela
  w żywej grze (`2026-10-15f`, `15h`, `16a`) albo świadomie zamknięte sekcją
  „Wykonanie”; brak urwanego w połowie planu technicznego do dokończenia przed
  audytem PR #171.

## Zakres audytu PR #171 (71 plików)

Podział przeglądu na warstwy (każdy plik sprawdzany pod kątem CR — z weryfikacją
źródłową wg ADR 0030 — ADR 0002, ADR 0003/0017, determinizmu ADR 0005 i realności
testów RED→GREEN wg L13):

1. **Silnik (`src/engine/`, 6 plików):**
   `combat.js`, `effects.js`, `fingerprint.js`, `game-state.js`, `objects.js`,
   `triggers.js` — m.in. kopie na stole (Jwari Shapeshifter / copy display /
   fingerprint), detain badges i `cantActivateAbilities` w `playerView`,
   właściciel przejętego lądu w `playerView`, sekwencyjne wybory Epic Experiment,
   cytaty CR 615.6.
2. **Kontroler bota (`src/controllers/`, 2 pliki):**
   `heuristic-bot.js` (+662/−98), `heuristic-params.js` — Battle-Rattle Shaman
   (`zamiarAtakuWybranego` / `widokDlaWycenyAtaku`), presja liczbowa (`B`:
   pojemność blokerów vs PMSSB-70), strażnik Duskmantle Seer (`D`), Chocobo Kick
   (PMSSB-78), Epic Experiment w Main 2, Benevolent Blessing timing.
3. **UI stołu (`src/table/`, 7 plików):**
   `choice-request.js`, `index.html`, `main.js`, `mana-wizard.js`,
   `multi-target.js`, `render.js`, `session.js` — `resolveWizardTriggerBlock`
   (auto-tap aury lądu), `xCost.black` w kreatorze many, grupowanie kosztów
   alternatywnych / Lash, osobna kontrolka Gift w kreatorze celów, wyświetlanie
   kopii Jwari Shapeshifter, sekwencyjne wybory Epic Experiment, log detain,
   tryby tytułu/ikon wyboru.
4. **Narzędzia i talie (`tools/`, `decks/`, 4 pliki):**
   `generate-plan-decks.mjs`, `split-deck-colors.mjs`, `decks/zendikar-rg.txt`,
   `decks/zendikar-wu.txt` — routing bezkolorowych wypełniaczy po koszcie rzutu
   (zgodność z ADR 0024!).
5. **Testy, fixture i dokumentacja (52 pliki):**
   weryfikacja mutacyjna nowych strażników (L13/L34/L159), kompletność opisu
   zmian w `PROJECT_HISTORY.md` i zgodność z ADR-ami (w tym sprawdzenie, czy
   zmiana w `generate-plan-decks.mjs` nie rozjeżdża się z zapisem ADR 0024).

## Etapy i planowane commity (ADR 0020 C — każdy zielony i od razu wypchnięty)

- [x] **Etap 0 — Plan i otwarcie PR:** zapis niniejszej roadmapy, walidacja
      strażników dokumentacji, commit + push na `arena/6f1bfb96-mtg`, otwarcie PR
      do `main` przed jakimkolwiek kodowaniem (ADR 0020 A).
- [x] **Etap 1 — Audyt PR #171 (71/71 plików):** przegląd wszystkich warstw,
      weryfikacja CR u źródła (ADR 0030), sondy graniczne i mutacje kluczowych
      pinów, raport `docs/audits/AUDYT_PR171_2026-10-23.md` (`ccd70dc`).
- [x] **Etap 2 — Naprawy znalezisk audytu PR #171:** wszystkie potwierdzone błędy
      (F-1..F-7) naprawione u root cause osobnymi zielonymi commitami z testami
      RED→GREEN (`f366660`, `c4543d7`, `c0e05ea`, `2bfe95b`, `cd6e027`, `fc8d84f`,
      `8025afe`, `a552639`, `bb7353a`).
- [x] **Etap 3 — Pętla jakości (ADR 0021 pkt 4):** 9 przebiegów Żywego Testera
      po `npm run build` (`0` zgłoszeń detektorów w `scan.mjs`) + naprawy 4 usterek
      opisów kart i odznak z lektury transkryptów (`LT-1..LT-4`, `03164cd`) +
      polowanie CR z naprawą 4 luk regułowych przy opuszczaniu pola bitwy/stosu
      (`CR-1..CR-4`, `d6ff380`: `CR 708.9`, `CR 603.10a`, `CR 707.2`, `CR 113.6`,
      `CR 400.3`).
- [x] **Etap 4 — Domknięcie i pełna brama:** `npm test` **8757/8757**, `npm run test:slow`
      **268/268** (`test:all` **9025/9025**), `npm run build` **75 modułów / 5383,3 kB**,
      `node tools/cr-numery.mjs --sprawdz`, strażnik budżetu lektury, uzupełnienie
      `docs/PROJECT_HISTORY.md`, `README.md`, `docs/setup/HANDOFF_2026-10-24.md`
      oraz kumulacyjny opis PR #172 (L92).

## Ryzyka i pułapki

- **Rozmiar PR #171 (71 plików, 31 commitów):** nie wolno prześlizgnąć się po
  późnych commitach UI/bota (`main.js`, `multi-target.js`, `choice-request.js`,
  `heuristic-bot.js`, `generate-plan-decks.mjs`) — każdy musi zostać sprawdzony
  linia po linii w diffie.
- **ADR 0024 vs `2f6ef43` (`Route colorless deck fillers by casting cost`):**
  sprawdzić, czy zmiana routingu bezkolorowych kart w `generate-plan-decks.mjs`
  jest zgodna z literą ADR 0024 czy wprowadza rozjazd wymagający korekty lub
  odnotowania dla właściciela.
- **Mutacje testowe (L136, L159):** kopie plików wyłącznie w `.arena/`, nigdy
  `git checkout <plik>` na pliku z niezacommitowaną pracą; po każdej mutacji
  `git status --short` czysty.
- **Ciche uruchamianie testów (ENVIRONMENT §5a):** zawsze przekierowanie do
  `.arena/*.log` z zachowaniem kodu wyjścia; nigdy pełny strumień TAP do czatu.
- **Brak force pusha (ADR 0020 D):** przed każdym pushem kontrola `git status`,
  `git log --oneline -3` oraz `git fetch origin arena/6f1bfb96-mtg`.
