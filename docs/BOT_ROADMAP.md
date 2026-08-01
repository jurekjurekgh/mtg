# Roadmapa rozwoju bota (B0–B5)

Dokument utrwala roadmapę zaproponowaną przez właściciela (2026-08-01) wraz
z jego rozstrzygnięciami pytań otwartych. Dotyczy Etapu 4 i dalszych etapów
[roadmapy](ROADMAP.md). Pomiar jakości realizuje harness B0
([`tools/benchmark.mjs`](../tools/benchmark.mjs)).

## Punkt wyjścia

Obecny bot (`src/controllers/heuristic-bot.js`) jest DETERMINISTYCZNY
(`randomness=0`) i świadomie dąży do wygranej, ale krótkowzrocznie: punktuje
każdą legalną komendę ręcznymi regułami i wybiera najlepszą (greedy, 1 krok
w przód). Nie przewiduje, nie planuje między turami, nie modeluje
przeciwnika, nie uczy się. Ślad decyzji: `trace()`.

## B0 — Harness pomiarowy ✅ (zrealizowane 2026-08-01)

Warunek wstępny: **bez pomiaru żadnych zmian w bocie.**

Zrealizowane elementy:

- `tools/benchmark.mjs` — macierz win-rate bot-vs-bot na WSZYSTKICH taliach
  `decks/*.txt`: boty `aggro`, `heuristic`, `random` (rejestr
  `BENCH_BOT_FACTORIES`), konfigurowalna liczba seedów (domyślnie 50),
  mecze rozgrywane na obu stronach stołu na tych samych rozdaniach (ten sam
  seed → te same biblioteki), raport tekstowy do terminala/PR i `--json`.
- Bot `aggro` przeniesiony z helpera testowego do katalogu produkcyjnych
  kontrolerów: `src/controllers/aggro-bot.js` (`createAggroBot`; dawne
  `createAggroController`, zachowanie bez zmian). Punkty odniesienia
  benchmarku są tymi samymi klasami, których używają testy.
- `random` w benchmarku gra bez losowej kapitulacji (`allowConcede: false`
  w `createRandomBot`) — inaczej „mecze" kończą się poddaniem w 1. turze
  i macierz nic nie mierzy. Domyślne zachowanie `createRandomBot` jest
  niezmienione (scenariusze testowe wciąż eksplorują też kapitulację).
- Test regresji `test/bot-benchmark.test.js` — próbka deterministyczna
  (`REGRESSION_CONFIG`), progi win-rate i sprawdzenie determinizmu harnessu.

### Praktyka pomiaru przy zmianach bota (obowiązująca od B0)

1. PR zmieniający bota uruchamia `node tools/benchmark.mjs` (pełna macierz)
   i wkleja tabelę „przed/po" do opisu PR.
2. Nowy bot NIE MOŻE być słabszy niż poprzedni na próbce — jeśli jest,
   zmiana wraca do przeróbki (chyba że właściciel świadomie akceptuje
   koszt, np. za nową zdolność).
3. Po akceptacji poprawy: progi w `test/bot-benchmark.test.js` są
   PODNOSZONE do zmierzonych wartości (z marginesem ~15 p.p. — próbka rośnie
   wraz z nowymi taliami).
4. Benchmark działa na OGÓLNYCH deskryptorach i taliach z repozytorium —
   nowa talia `decks/*.txt` automatycznie wchodzi do macierzy.

### Pomiar bazowy (2026-08-01, pełna macierz: 50 seedów, baza 1000, 8400 meczów)

| Para | Wynik | Śr. długość meczu |
|---|---|---|
| heuristic vs random | **70.8%** (1983/2800) | 16.5 tury |
| heuristic vs aggro | **61.6%** (1725/2800) | 15.5 tury |
| aggro vs random | **73.4%** (2056/2800) | 16.4 tury |

Razem: heuristic 66.2% (3708/5600), aggro 55.9% (3131/5600), random 27.9%
(1561/5600). Niedokończone mecze: 0. Próbka regresji (`REGRESSION_CONFIG`,
4 seedy bazy 2026): 68.3% vs random, 64.7% vs aggro.

Obserwacja z macierzy: talia `synthetic-abilities` jest zauważalnie silniejsza
od pozostałych (wygrywa nawet w rękach RandomBota) — pary z jej udziałem
dowodzą głównie o sile TALII, nie o jakości decyzji. Do oceny zmian bota
liczy się przede wszystkim wynik zagregowany oraz pary bez tej talii.

## B1 — Lepsza heurystyka (najtańszy duży zysk)

Rozszerzyć punktowanie o:

- zegar (tury do zabicia / do śmierci wg życia),
- ocenę planszy (liczba stworów, suma siły, keywordy flying/vigilance,
  nietapnięte landy jako obrona),
- przewagę kart (ręka),
- sekwencjonowanie (land przed stworem, tap w dobrej kolejności, czary po
  walce, „trzymanie many" na odpowiedź instant),
- optymalny X przy {X},
- wartość triggerów (reanimacja Zoraline, obrót wilkołaka = planuj 0 albo 2
  czary w turze).

Zasada: bot operuje na OGÓLNYCH deskryptorach (abilities/keywords/typy),
nie na nazwach kart (zgodnie z duchem ADR 0002).

## B2 — Lookahead / symulacja „co by było, gdyby" (przewidywanie)

Engine jest deterministyczny, seedowalny i headless — bot może klonować stan
(`structuredClone`) i symulować: ograniczony lookahead (np. do końca swojej
tury lub 1–2 tury), ocena liścia funkcją z B1, mini-max z przeciwnikiem jako
prostą polityką (np. bot B1). Ogranicz rozgałęzienie (top-K komend wg
heurystyki, cap). To naturalny krok „przewidywania" — determinizm utrzymuje
testy stabilne.

## B3 — Modelowanie przeciwnika (prawdopodobieństwa)

Talie OBU graczy są znane (`decks/*.txt`, `REPO_DECKS`), a engine śledzi
strefy — bot może liczyć prawdopodobieństwo (rozkład hipergeometryczny),
że przeciwnik trzyma odpowiedź/removal, i kalkulować EV zagrań. Do tego
adaptacja do obserwowanego zachowania (blokuje? tapuje się do zera? trzyma
instant?).

## B4 — Uczenie (opcjonalne, po B0–B3; decyzja projektowa)

- Najpierw: strojenie wag heurystyki przez ewolucję (hill-climbing na
  win-rate z B0 — tanie, zero zależności, duży efekt).
- Potem opcjonalnie: MCTS (czysty JS, bez zależności) albo mała sieć
  policy/value.
- Self-play do generowania danych (silnik szybki i deterministyczny).

**Rozstrzygnięcie właściciela (2026-08-01) — warunek dla ewentualnej
zależności ML:** dopuszczalna tylko, jeśli stół nadal uruchamia się
(a) lokalnie z pobranego pliku / z lokalnego serwera HTTP oraz (b) zdalnie
z GitHub Pages na iPadzie/iPhonie, BEZ instalowania czegokolwiek na
urządzeniu. W praktyce oznacza to czysty JS sklejany do jednoplikowego
artefaktu (ADR 0011): waga/model musiałby być danymi w repo lub kodem —
framework ML wymagający runtime'u odpada. Wprowadzenie jakiejkolwiek
zależności ML to decyzja właściciela i nowy ADR (roadmapa wyżej).

## B5 — Trudności i UX

- **Rozstrzygnięcie właściciela (2026-08-01):** „rozumowanie" bota ma być
  widoczne w OSOBNYM okienku stołu (ze śladu `trace()` → „dlaczego bot
  zagrał X"), **domyślnie zwiniętym**, a docelowo rozwiniętym. Poziom
  trudności bota: **maksymalny dostępny** (bez sztucznego osłabiania;
  ewentualny wybór talii/przeciwnika po stronie UI).
- Przydatne właścicielowi do testów i debugowania; realizacja po B1–B3,
  kiedy rozumowanie będzie ciekawsze niż jedna liczba przy komendzie.

## Ograniczenia architektoniczne (nie łamać)

- ADR 0004: kontrolery są wymienne — bot implementuje ten sam interfejs co
  `createRandomBot`/`createHeuristicBot`.
- ADR 0005: determinizm i seed, bez `Math.random` — to warunek odtwarzalności
  benchmarku i replayu.
- FoW: bot widzi wyłącznie `PlayerView` (nie mutuje stanu; B2 symuluje na
  własnych klonach). Klasyczny minimax ogranicza ukryta informacja — B3
  liczy prawdopodobieństwa.
- Engine jest jedynym autorytetem reguł.
- Core nie zna nazw kart — bot też operuje na generycznych deskryptorach.
