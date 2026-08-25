# PLAN 2026-08-25 — M205: audyt PR #77 + dowód auto-passa w transkrypcie

- **Sesja:** `arena/01a038fe-mtg` (M205), PR **#78**
- **Tryb:** ADR 0020 (PR na starcie → audyt poprzedniego PR → inkrementalne
  commity → nigdy force push) + ADR 0021 (prompt „kontynuujemy” = pętla
  domyślna, bez pytania o kolejkę).
- **Baza zmierzona przed pracą:** `npm test` **3200/3200**, `npm run build`
  **54 moduły / 2637,2 kB**, `HEAD` = `cb79296` (squash PR #77).

## Kontekst

PR #77 (M204) scalony 2026-08-25. Zostawił jawnie nazwany temat **M205**
(`docs/setup/HANDOFF_2026-08-25-m204.md` → „Znany problem”): detektor
`detectNoResponseWindow` zgłasza instanty/sorcery rzucane w turze bota
(Courage in Crisis, Sagittars' Volley) jako „brak okna na odpowiedź”, choć
engine jest poprawny (auto-pass człowieka przy braku odpowiedzi, CR 117).
Brakuje **dowodu auto-passa w transkrypcie**.

## Etapy

### 0. Roadmapa i PR (ten commit)
- [x] PR #78 otwarty przed kodowaniem (ADR 0020 A), gałąź na GitHubie.
- [x] Baza zmierzona (`npm test` 3200/3200, build 54/2637,2 kB).
- [x] Plan zapisany w `docs/plans/`.

### 1. Audyt PR #77 (ADR 0020 B) — W TOKU
PR #77 to 6 plików (`src/engine/spells.js`, `test/table-tester-detectors.test.js`
+ 4 dokumenty). Przegląd każdego + weryfikacja mutacyjna testów.

- [x] `src/engine/spells.js` (M204/1) — poprawka kosmetyczna zweryfikowana:
  usunięty duplikat komentarza, wcięcie pętli `spellPhyrexianVariants`
  przywrócone do 8 spacji; logika (`baseCost`, `bbCost`, `pipMana`,
  `phyrexianPayWithLife`, `casts.push`) nietknięta. Zgodne z ADR 0016.
- [x] **ZNALEZISKO M205/1 (test ślepy)** — oba testy M203/#3 dodane w PR #77
  przechodzą IDENTYCZNIE z fiksem deduplikacji i bez niego. Pomiar niżej.
- [ ] Raport w `docs/audits/AUDYT_PR77_2026-08-25.md`.
- [ ] Naprawa M205/1: testy, które faktycznie czerwienieją po cofnięciu fiksu.

#### Pomiar M205/1 (weryfikacja mutacyjna)

Mutacja: w `tools/table-tester/detectors.mjs` linia
`if (text !== prevBlock) deduped.push(...cur);` → `deduped.push(...cur);`
(czyli deduplikacja przedruków bloku WYŁĄCZONA). Po mutacji
`node --test test/table-tester-detectors.test.js` → **91/91 pass**, czyli
komplet testów detektorów nie zauważa cofnięcia fiksu, który PR #77
deklarował jako „przypięty testem”.

Przyczyna: przypadek z repo skleja bloki bez separatora i powtarza w każdym
bloku linię `• Tura 7 — Nieprzyjaciel`. Ta linia **sama zeruje licznik**
(`flush()` w gałęzi `turnMark`), więc akcje nigdy nie sumują się do progu 4 —
niezależnie od deduplikacji. Test był zielony z niewłaściwego powodu (L1).

Zmierzone (liczba zgłoszeń `detectBotRepeats`, z fiksem / bez fiksu):

| przypadek | z fiksem | bez fiksu | wykrywa regresję? |
|---|---|---|---|
| REPO-A: `4× [hdr, turn, act]` sklejone (wersja z PR #77) | 0 | 0 | **NIE (ślepy)** |
| B: `5× [hdr, act]` rozdzielone separatorem `--- krok N \| T. 7 ---` | 0 | 1 | **TAK** |
| C: `5× [hdr, act]` sklejone bez separatora | 1 | 1 | NIE (ślepy) |

Wniosek: dowodowy jest wyłącznie kształt **B** — bloki rozdzielone realnym
separatorem kroku (tak wygląda transkrypt: `snapshot()` wypisuje
`--- krok N | T. X ---` między renderami modala), bez powtarzanej linii
`• Tura N`, która maskuje pomiar.

- [ ] Kryterium: nowy test czerwienieje po tej samej mutacji, zielony po jej
  cofnięciu; `npm test` + build zielone.

### 2. M205 — dowód auto-passa w transkrypcie
Wg recepty z HANDOFF M204 (4 kroki), ale każdy krok potwierdzony pomiarem,
nie przepisany na wiarę:

- [ ] `src/table/session.js`: auto-pass człowieka przy **niepustym stosie**
  zostawia jawny wpis w logu sesji (bez wymuszania pauzy — M204 zmierzył,
  że pauza pogarsza inne przebiegi).
- [ ] `tools/table-tester/run-game.mjs`: wpis trafia do transkryptu także
  w `--quiet`.
- [ ] `tools/table-tester/detectors.mjs`: `detectNoResponseWindow` uznaje go
  za dowód odzyskania kontroli.
- [ ] `test/table-tester-detectors.test.js`: test pinuje obie strony
  (jest dowód → cicho; brak dowodu → zgłoszenie), z weryfikacją mutacyjną.
- [ ] Kryterium: partie z M204 (te same pary talii i seedy) przestają
  zgłaszać szum, a `npm test` + build zielone.

### 3. Pętla jakości Żywym Testerem
- [ ] Partie po naprawie; każde znalezisko: objaw z transkryptu → root cause →
  test RED→GREEN → detektor, jeśli klasa powtarzalna.

### 4. Zamknięcie sesji
- [ ] `docs/PROJECT_STATE.md`, `docs/setup/HANDOFF_2026-08-25-m205.md`,
  opis PR #78 kumulatywnie, `git status` czysty.

## Ryzyka i pułapki

- **Test zielony z niewłaściwego powodu** (L1, właśnie zmaterializowany
  w M205/1) — każdy nowy test detektora sprawdzam mutacją, zanim uznam
  za dowód.
- **Reset workspace w trakcie sesji** — commit + push po każdym zielonym
  kroku, `git log --oneline -1` po commicie (ADR 0020 D, ENVIRONMENT §2).
- **Polskie znaki w `edit_file`** — edycje przez `python3` + `pathlib` (UTF-8).
- **Pełny B0 tylko na komendę właściciela** (ADR 0018).
- **„Samodzielnie zielony” = cały pakiet** `npm test`, nie pojedynczy plik.
