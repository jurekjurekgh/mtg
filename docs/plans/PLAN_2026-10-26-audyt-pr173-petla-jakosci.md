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

### Etap 0 — rozpoznanie i plan (WYKONANE)

Kryterium: powyższy stan bazowy + ten plik. Brak zmian w `src/`.

### Etap 1 — PR na starcie (ADR 0020 A) (WYKONANE)

Osobny commit z tą roadmapą, push na gałąź sesji, otwarcie PR do `main`
z szablonu opisu. PR istnieje na GitHubie **przed** pierwszą zmianą kodu.

### Etap 2 — techniczny audyt scalonego PR #173 (ADR 0020 B / 0016 / 0030)

Zakres: **58 plików, 47 commitów** (`b52c971..3657762`, squash `60a516c`),
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

### Etap 5 — domknięcie sesji

- pełna brama: `npm test`, `npm run test:slow`, `npm run build`,
  `node tools/benchmark.mjs` (profil SZYBKI; **bez** `--full` — ADR 0018);
- `README.md` — aktualny punkt zaczepienia ze ZMIERZONYMI liczbami (L92),
  `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-10-26.md`,
  podsumowanie wykonania w tym planie, kumulatywny opis PR;
- `git status` czysty, `git log origin/<gałąź>..HEAD` pusty;
- **bez merge** — decyzja właściciela (ADR 0007/0020).

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

(uzupełniane na końcu sesji — po ostatnim commicie funkcjonalnym).
