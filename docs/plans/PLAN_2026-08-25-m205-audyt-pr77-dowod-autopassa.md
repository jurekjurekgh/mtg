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

### 1. Audyt PR #77 (ADR 0020 B) — ZAKOŃCZONY
PR #77 to 6 plików (`src/engine/spells.js`, `test/table-tester-detectors.test.js`
+ 4 dokumenty). Przegląd każdego + weryfikacja mutacyjna testów.

- [x] `src/engine/spells.js` (M204/1) — poprawka kosmetyczna zweryfikowana:
  usunięty duplikat komentarza, wcięcie pętli `spellPhyrexianVariants`
  przywrócone do 8 spacji; logika (`baseCost`, `bbCost`, `pipMana`,
  `phyrexianPayWithLife`, `casts.push`) nietknięta. Zgodne z ADR 0016.
- [x] **ZNALEZISKO M205/1 (test ślepy)** — oba testy M203/#3 dodane w PR #77
  przechodzą IDENTYCZNIE z fiksem deduplikacji i bez niego. Pomiar niżej.
- [x] Raport w `docs/audits/AUDYT_PR77_2026-08-25.md` (`273d1ce`).
- [x] Naprawa M205/1 (`37e51cb`): mutacja daje 91/92 (RED), cofnięcie 92/92.

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

- [x] Kryterium SPEŁNIONE: nowy test czerwienieje po tej samej mutacji,
  zielony po jej cofnięciu; `npm test` 3201/3201, build zielony.

### 2. M205 — dowód auto-passa w transkrypcie — ZAKOŃCZONY (`8204777`)
Wg recepty z HANDOFF M204 (4 kroki), ale każdy krok potwierdzony pomiarem,
nie przepisany na wiarę:

- [x] `src/table/session.js`: auto-pass człowieka przy **niepustym stosie**
  zostawia jawny wpis w logu sesji (bez pauzy). Przy pustym stosie wpisu NIE
  ma — inaczej log tonie w szumie passów fazowych.
- [x] `tools/table-tester/run-game.mjs`: wpis trafia do transkryptu także
  w `--quiet`. **Sprostowanie recepty M204:** liczenie „nowych" linii po
  indeksie OD PRZODU nie działa — `render.js` rysuje log od najnowszego
  (`reverse()`), więc świeże wpisy są na POCZĄTKU listy DOM (0 trafień
  w pierwszej implementacji). Poprawnie: `slice(0, nowe).reverse()` (L62).
- [x] `tools/table-tester/detectors.mjs`: `detectNoResponseWindow` uznaje go
  za dowód odzyskania kontroli.
- [x] Testy pinują obie strony, każdy z weryfikacją mutacyjną:
  `test/table-tester-detectors.test.js` (dowód → cicho; brak dowodu →
  zgłoszenie) oraz `test/session-autopass.test.js` (wpis powstaje przy
  niepustym stosie, NIE powstaje przy pustym — mutacje „nigdy" i „zawsze"
  obie czerwienieją).
- [x] Kryterium SPEŁNIONE: seed 42 **2 → 0 zgłoszeń**; cztery partie po 400
  kroków (innistrad/tarkir 7, mirrodin/warhammer 13, ravnica/innistrad 21,
  forgotten-realms/alara 61) — **0 zgłoszeń**, 15–37 dowodów auto-passa
  w transkrypcie. Moc detektora potwierdzona kontrolnie: po cofnięciu wzorca
  dowodowego zgłoszenia wracają (1 + 1). `npm test` 3205/3205, build zielony.

### 3. Pętla jakości Żywym Testerem — WYKONANA W ZAKRESIE SESJI
- [x] 5 partii po naprawie (400 kroków, `--quiet`): 0 crashy, 0 zgłoszeń.
- [x] Znalezisko poboczne naprawione u root cause: `--out` do nieistniejącego
  katalogu tracił CAŁY transkrypt po ~40 s przebiegu (ENOENT dopiero przy
  zapisie); katalog tworzony z góry, `.gitignore` rozszerzony o podkatalogi.
- Uwaga dla następnej sesji: detektory na tych parach talii są ciche —
  kolejne znaleziska wymagają dłuższych partii i RĘCZNEGO czytania
  transkryptów (profile `explorer`/`random` są najmniej przeorane).

### 4. Zamknięcie sesji
- [x] `docs/PROJECT_STATE.md`, `docs/setup/HANDOFF_2026-08-25-m205.md`,
  lekcje L61/L62, opis PR #78 kumulatywnie, `git status` czysty.

## Podsumowanie wykonania

Wszystkie etapy domknięte. Baza 3200 → **3205** testów (+5: 3 detektorowe,
2 sesyjne), build 54 / 2638,1 kB. Zamknięty temat przekazany przez M204 jako
„znany problem" oraz naprawiona usterka zastana w audycie (ślepe testy).
Dwie nowe lekcje trwałe: **L61** (test bez weryfikacji mutacyjnej bywa ślepy),
**L62** (kolejność renderu jest częścią kontraktu narzędzi czytających DOM).

## Ryzyka i pułapki

- **Test zielony z niewłaściwego powodu** (L1, właśnie zmaterializowany
  w M205/1) — każdy nowy test detektora sprawdzam mutacją, zanim uznam
  za dowód.
- **Reset workspace w trakcie sesji** — commit + push po każdym zielonym
  kroku, `git log --oneline -1` po commicie (ADR 0020 D, ENVIRONMENT §2).
- **Polskie znaki w `edit_file`** — edycje przez `python3` + `pathlib` (UTF-8).
- **Pełny B0 tylko na komendę właściciela** (ADR 0018).
- **„Samodzielnie zielony” = cały pakiet** `npm test`, nie pojedynczy plik.
