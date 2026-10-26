# PLAN 2026-10-26 — kontynuacja: audyt PR #173 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt.” Brak nazwanego tematu → obowiązuje pętla
domyślna wg ADR 0020 i ADR 0021. Jedyny plik startowy to `AGENTS.md`; ten plan
jest roadmapą JEDNEGO bieżącego zadania (audyt + pętla jakości), nie kolejką.

**Gałąź:** `arena/b47146a6-mtg` (od `main` @ `60a516c` = squash PR #173,
scalonego 2026-10-26 15:16 UTC). Jeden PR sesji, kumulatywny opis.

## Stan bazowy (zmierzony przed jakimkolwiek kodowaniem)

- lektura obowiązkowa w całości: `AGENTS.md`, rejestr ADR + ADR 0001–0030,
  `docs/LESSONS.md` (2267 linii, L1–L189), `docs/setup/ENVIRONMENT.md`,
  `gh pr view/diff 173`, `docs/setup/HANDOFF_2026-10-24b.md`;
- `npm test` (cicho, ENVIRONMENT §5a): **8836/8836 pass**, ~128 s;
- `npm run build`: **76 modułów / 5438,3 kB** — zgodnie z handoffem PR #173;
- brak otwartych PR-ów; najnowszy plan na `main`
  (`PLAN_2026-10-24-audyt-pr172-petla-jakosci.md`) ma 0 nieodhaczonych
  kryteriów (sprawdzone grepem `- [ ]` w 8 najnowszych planach).

## Etapy i kryteria ukończenia

### Etap 0 — rozpoznanie i plan

- [x] Kryterium: powyższy stan bazowy + ten plik. Brak zmian w `src/`.
      (commit `79503c3`)

### Etap 1 — PR na starcie (ADR 0020 A)

- [x] Osobny commit z tą roadmapą, push na gałąź sesji, otwarcie PR do `main`
      z szablonu opisu **przed** pierwszą zmianą kodu — PR
      [#174](https://github.com/jurekjurekgh/mtg/pull/174) (commit `79503c3`).

### Etap 2 — techniczny audyt scalonego PR #173 (ADR 0020 B / 0016 / 0030)

- [x] **WYKONANE** — raport `docs/audits/AUDYT_PR173_2026-10-26.md`
      (58/58 plików, cytaty CR zweryfikowane w `.arena/cr-raw.txt`
      SHA zgodny z pinem, mutacje M1–M4 z pełnym pakietem dla M3).
      Znaleziska: **F-1** `paymentReachableMana` liczy manę Skarbu
      dwukrotnie (fantomowe „Zapłać”), **F-2** `autoManaUnits` dokłada
      manę ograniczoną bez celu wydania (filtr przepuszcza nieopłacalny
      cast), **F-3** brak pinu ścieżki dla wywołania
      `interruptMutesOnNewTargetCombination` (M3 + pełne 8836/8836
      na zielono). Obserwacje O-1..O-3 bez naprawy. Naprawy w Etapie 3.

Zakres audytu: **58 plików, 47 commitów** (`b52c971..3657762`, squash `60a516c`),
+511 tys. linii w repozytorium to skutek squasha — audytujemy **agregat diffu**
z GitHuba (`pulls/173/files`), nie pojedynczy root commit lokalny.

Kolejność pracy:

1. Pobrać agregat diffu (58 plików) oraz per-commit patche (47) do `.arena/`
   (poza Git). Per-commit patche służą do sprawdzenia RED→GREEN: czy test
   powstał w tym samym commicie co fix i czy mutacja fixu czerwieni pin.
2. **CR u źródła (ADR 0030):** pobrać `cr-raw.txt` (wydanie 2026-09-25,
   SHA-256 zgodny z `test/helpers/cr-numery-tabela.js`) z mirroru przez
   `api.github.com`; bez dosłownego cytatu nie wolno zgłaszać znaleziska
   regułowego ani go naprawiać.
3. Przegląd **każdego** zmienionego pliku produkcyjnego (`src/engine/*`,
   `src/controllers/*`, `src/table/*`) pod kątem: logiki i maskowania
   objawu (root cause), ADR 0002 (zero rozgałęzień po nazwie/ID karty),
   ADR 0003/0017 (FoW i kompletność `PlayerView`), ADR 0005 (determinizm,
   brak `Math.random`/`Date.now` w kodzie artefaktu), kontraktu zdarzeń
   (L107/L112/L130/L187: emiter niesie komplet pól, bez dublowania).
4. Przegląd testów: czy pin mierzy REGUŁĘ, nie implementację (L5/L160),
   czy okaz ma kształt kontraktu (klasa F-1 z audytu PR #172, L65),
   czy test nie jest no-opem przy domyślnych wagach (L159). Wybrać
   co najmniej 4 pinów do weryfikacji mutacyjnej (L13/L34: kopia pliku
   z GIT/HEAD do `.arena/`, mutacja → RED → przywrócenie KOPIĄ, nie
   `git checkout` — L136).
5. Przegląd dokumentacji: liczby bramek, numery CR, nazwy symboli,
   zgodność `docs/LESSONS.md` z kodem, backlog/handoff (L142/L143/L164/L165).
6. Wynik: `docs/audits/AUDYT_PR173_2026-10-26.md` (zakres, zweryfikowane
   pozytywnie obszary, znaleziska z wagą, tabela mutacji, plan napraw),
   odhaczenie w tym planie, wpis w `docs/PROJECT_HISTORY.md`, aktualizacja
   opisu PR.

Kryterium: raport audytu w repo + co najmniej 4 mutacje udokumentowane
RED/GREEN + każdy z 58 plików wymieniony w raporcie jako sprawdzony.
Bramka: `npm test` + `npm run build` nadal zielone (audyt nie zmienia kodu).

### Etap 3 — naprawy znalezisk audytu (osobne zielone commity)

Każde znalezisko: test odtwarzający (jeśli brak) → naprawa u root cause →
`npm test` + `npm run build` (cicho) → commit → push → odhaczenie w planie.
Kolejność: waga błędu (reguły/legalność → wycena bota → UI/log → dokumentacja).
Zakaz maskowania: bez `try/catch`/`return` ukrywającego przyczynę.

- [x] **WYKONANE** — **F-1** `paymentReachableMana` bez podwójnego liczenia
      Skarba (test `audyt-pr173-skarb-podwojny-osiagalnosc` 4/4, commit
      `d033956`), **F-2** jednostki many ograniczonej purpose-aware w
      `mana-offer-guards` (test `audyt-pr173-jednostki-ograniczone-w-filtrze`
      6/6, `5e29ec4`), **F-3** pin ścieżki
      `interruptMutesOnNewTargetCombination` na poziomie sesji
      (test `audyt-pr173-m2-pin-sciezki`, czerwony pod mutacją M3,
      `d3d9ba1`). Bramka po Etapie 3: 8847/8847, build 76 / 5441,9 kB.
      Dodatkowo w Etapie 4 naprawiony **F-4** (patrz niżej).

### Etap 4 — pętla domyślna (ADR 0021 pkt 4)

Bez nowego batcha kart (ADR 0029: katalog rośnie wyłącznie z kolekcji
właściciela). Kolejność:

1. **Żywy Tester stołu** na zbudowanym artefakcie (`npm run build`,
   `npm i` w `tools/table-tester`): 4 partie taliami spoza próbki
   benchmarku, różne profile bota, transkrypty do `.arena/`. Trzy osie
   z `TESTER_STOLU.md`; ręczna lektura transkryptów (L27: zero zgłoszeń
   detektorów to pomiar narzędzia, nie produktu). Braki testera naprawiać
   w testerze (L12).
2. **Analizatory statyczne i audyty decyzji:** `tools/event-contract-audit.mjs`,
   `tools/family-audit.mjs` (jeśli istnieje tryb audytu),
   `tools/scoring-{unvalued,choice-space,pay-census}-audit.mjs` — policzyć
   rodziny decyzji w próbce (L179: 0 obserwacji to brak danych).
3. **Polowanie na niezgodności z CR inną ścieżką niż poprzednia sesja**
   (poprzednia: LKI/zakryte/CR 708.9 i 603.10). Kandydaci na tę sesję:
   warstwy i znaczniki czasu (CR 613/611), efekty zastępcze (CR 614),
   state-based actions (CR 704), kolejność triggerów/priorytet (CR 603/117),
   płatność i pula many (CR 106/601.2). Każdy kandydat: dosłowny cytat
   z pobranego CR → sonda headless przez `execute()` (L111/L116) → dopiero
   wtedy wniosek. Błąd → osobny zielony commit z testem i cytatem w teście.
4. **Anty-over-fix:** przy każdej zmianie wyceny bota sprawdzić pin
   przeciwny (L121/L181), golden-master (`test:slow`) i próbkę benchmarku.

Kryterium: co najmniej 4 partie testera + raport z osi + co najmniej jedno
udokumentowane polowanie CR (z cytatem i sondą, także gdy wynik = „poprawne”).

- [x] **WYKONANE** — **Żywy Tester (4/4 partie, wszystkie ukończone
      naturalnie):** theros↔ravnica-rg (explorer, tick 0,2, seed 7001),
      mirrodin-brg↔wiedzmin-bg (defensive, 7002), innistrad-brg↔tarkir-wur
      (random, 7003), wiedzmin-wur↔zendikar-rg (impatient, 7004);
      `--steps 400 --quiet`, transkrypty `tools/table-tester/.arena/tt-{1..4}.txt`.
      **Oś 1 (detektory):** 0 zgłoszeń we wszystkich4. **Oś 2 (niewycenione):**
      0 — każdy wybrany ruch bota miał dedykowaną wycenę. **Oś 3 (pokrycie UI):**
      9–19 akcji widzianych partię, kliknięte 9–17, modale0–2, sondy noop 23–40.
      Ręczna lektura: Cuombajj „cel wskazuje przeciwnik” = tekst Oracle
      („1 damage to any target of an opponent's choice”, pin B/1–B/3);
      mulligan londyński7/6/5→4 kart z enumeracją podzbiorów deduplikowaną
      po nazwach (CR 400.1, `commandForMulliganSelection` po nazwie — pełna
      przestrzeń wyboru); Descendant of Storms „nie można opłacić kosztu”
      zgodne z maną po opłaceniu Artful Maneuver. **F-4 (znalezisko testera):**
      bundler pomijał aliasowe importy (`import { x as y }` z PR #173) —
      artefakt padał na `castFiltersApplicable is not defined`; fix
      (`const y = x;` w `stripModuleSyntax` + świadomość kolizji w
      `module-graph`) ze strażnikiem `test/artefakt-aliasy-importow.test.js`
      (A1–A3, mutacja usunięcia emisji czerwieni A1), commit `479b4f6`;
      po fixie te same4 partii czyste.
- [x] **Analizatory** (wszystkie zielone): `event-contract-audit` — brak
      naruszeń; `family-audit` — brak naruszeń; `scoring-unvalued-audit`
      12 partii / 5615 komend — BRAK decyzji bez wyceny; `scoring-choice-space-audit`
      6 partii — brak obserwacji >1-wariantowych (0 obserwacji = brak danych,
      nie dowód); `scoring-pay-census` 12 partii — BRAK zapłat w próbce talii
      (zapisane jako brak danych, nie wynik).
- [x] **Polowanie CR (ścieżka 510/704/104 — inna niż LKI/708.9/603.10):**
      cytaty dosłowne z `.arena/cr-raw.txt` (SHA zgodny z pinem): 510.2,
      510.3a, 704.5a, 104.1 „A game ends immediately when a player wins…".
      Sonda `.arena/probe-cr510-loss.mjs` (A śmiertelny + B kontrolny):
      trigger Relic Robber trafiał na stos PO `player_lost` (objaw z
      transkryptu tt-4). Naprawa: `processTriggers` zwraca `[]` przy
      `status !== 'active'`, `resolve_combat` nie posuwa kroku po `finished`;
      test `test/cr-104-1-trigger-po-koncu-gry.test.js` (2, z cytatem CR),
      mutacje M5 (usunięcie gate'a triggerów) i M6 (gate kroku) obie RED,
      tabela numerów CR +104.1/+510.3a (guard ADR 0030), commit `f8662c4`.

### Etap 5 — domknięcie sesji

- pełna brama: `npm test`, `npm run test:slow`, `npm run build`,
  `node tools/benchmark.mjs` (profil SZYBKI; **bez** `--full` — ADR 0018);
- `README.md` — aktualny punkt zaczepienia ze ZMIERZONYMI liczbami (L92),
  `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-10-26.md`,
  podsumowanie wykonania w tym planie, kumulatywny opis PR;
- `git status` czysty, `git log origin/<gałąź>..HEAD` pusty;
- **bez merge** — decyzja właściciela (ADR 0007/0020).

- [x] **WYKONANE** — bramy: `npm test` **8852/8852**, `test:slow`
      **268/268**, build **76 modułów / 5442,8 kB**, benchmark quick
      **672 mecze, heuristic 87,8%** (590/672; bez regresji, `--full`
      nie uruchamiano). Dokumentacja: README (liczby + punkt zaczepienia),
      `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-10-26.md`,
      ten plan, kumulatywny opis PR #174; stan czysty; merge niewykonywany.

## Planowana kolejność commitów (każdy samodzielnie zielony)

1. `docs(plan)` — ten plan + otwarcie PR. ✔
2. `docs(audyt)` — raport audytu PR #173 + odhaczone Etapy 0–2.
3. `fix(...)` × N — po jednym na znalezisko audytu (test + kod + pin).
4. `fix(...)/docs(...)` × M — znaleziska pętli jakości (osobno każde).
5. `docs` — domknięcie: liczby, historia, handoff, opis PR.

Dokumentacja może iść z ostatnim commitem funkcjonalnym, ale nie zastępuje
osobnych commitów na kod (ADR 0020 C).

## Ryzyka i pułapki (z rejestru lekcji)

| Ryzyko | Obrona |
|---|---|
| Reset sandboxa w trakcie sesji | commit + push po KAŻDYM zielonym kroku; przed pushem `git fetch origin <gałąź>` i porównanie obu kierunków; zero force push (ADR 0020 D, ENVIRONMENT §2, L184) |
| Mutacja „zielona” = martwy pin | mutuj DOKŁADNY blok, weryfikuj wykonanie podmiany (`git diff`), przywracaj kopią z `.arena/` (L34/L136/L159) |
| Błędna interpretacja CR z pamięci | dosłowny cytat z `cr-raw.txt` (wydanie 2026-09-25, pin SHA) przed zmianą (ADR 0030, L164/L165) |
| Testy zalewające czat | zawsze `> .arena/*.log 2>&1`, tylko podsumowanie + wycinek błędu (ENVIRONMENT §5a) |
| Pełny benchmark przez przypadek | tylko `node tools/benchmark.mjs` (quick), nigdy `--full` (ADR 0018) |
| Nowe karty z inwencji sesji | ADR 0029 — test na karcie syntetycznej, katalog nietknięty |
| Zmiana `docs/LESSONS.md` powyżej budżetu | wpis w formacie Przypadek/Reguła/Strażnik, proza do `LESSONS_PRZYPADKI.md`; strażnik budżetu w `npm test` |

## Podsumowanie wykonania

**Sesja 2026-10-26 (PR #174, gałąź `arena/b47146a6-mtg` od `60a516c` = squash
PR #173).** Kolejność commitów: `79503c3` plan → `76403a7` raport audytu
(58/58 plików, cytaty CR zweryfikowane, mutacje M1–M4) → `d033956` F-1 →
`5e29ec4` F-2 → `d3d9ba1` F-3 → `479b4f6` F-4 (aliasy importu w artefakcie,
znalezisko Żywego Testera) → `f8662c4` CR 104.1 (koniec gry bez triggera na
stosie) → commit domknięcia.

Znaleziska: **F-1** `paymentReachableMana` liczył manę Skarbu dwukrotnie
(fantomowe „Zapłać”) — fix bez efektów `fromTreasure` w pule osiągalnej;
**F-2** `autoManaUnits` dokładał manę ograniczoną niezależnie od celu
(fantomowy cast nie-artefaktu) — jednostki purpose-aware + `restrictedManaUnits`
i `castCostOf` z artefaktem; **F-3** wywołanie
`interruptMutesOnNewTargetCombination` bez pinu ścieżki (mutacja M3 przechodziła
przez pełne8836/8836) — pin sesyjny; **F-4** bundler pomijał aliasowe deklaracje
importu, więc `dist/mtg-table.html` padał na `castFiltersApplicable is not
defined` jeszcze przed partią (Node-testy na ESM tego nie widzą) — emitowane
`const y = x;` + kolizje nazw przez aliasy + strażnik artefaktu. Obserwacje
O-1..O-3 z audytu świadomie bez naprawy (dokumentacja w raporcie).

Pętla jakości (Etap 4): 4 partie testera0 zgłoszeń na trzech osiach; 5
analyzerów zielonych; polowanie CR na ścieżce 510/704/104 z cytatem, sondą,
fixem i dwoma mutacjami (patrz wyżej). Obie „podejrzane” ścieżki z ręcznej
lektury transkryptów (Cuombajj — cel wskazywany przez przeciwnika wg Oracle;
mulligan — enumeracja podzbiorów deduplikowana po nazwach, CR 400.1)
okazały się poprawne i mają piny.

Bramki KOŃCOWE (zmierzone): `npm test` **8852/8852** (było 8836),
`npm run test:slow` **268/268**, `npm run build` **76 modułów / 5442,8 kB**
(było 5438,3), benchmark quick **heuristic 87,8%** (590/672, bez regresji;
`--full` nieuruchamiany zgodnie z ADR 0018).
