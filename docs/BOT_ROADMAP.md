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

### Pomiar bazowy (2026-08-01, po Batchu 4: 9 talii, 50 seedów, baza 1000, 13 500 meczów)

| Para | Wynik | Śr. długość meczu |
|---|---|---|
| heuristic vs random | **67.4%** (3035/4500) | 17.3 tury |
| heuristic vs aggro | **59.0%** (2657/4500) | 15.0 tury |
| aggro vs random | **71.4%** (3214/4500) | 17.0 tury |

Razem: heuristic 63.2% (5692/9000), aggro 56.2% (5057/9000), random 30.6%
(2751/9000). Niedokończone mecze: 0. Próbka regresji (`REGRESSION_CONFIG`,
4 seedy bazy 2026): 62.5% vs random (225/360), 60.8% vs aggro (219/360);
progi w teście = zmierzone −15 p.p.

Zmiana względem pomiaru po Batchu 3 (heuristic 70.6% vs random, 61.1% vs
aggro) nie jest regresją jakości, tylko skutkiem dwóch zmierzalnych
ruchów: (1) aggro nauczył się używać equip (sila na stole wzrasta obu
stronom, ale aggro wygrywa tempo — macierz aggro vs random w górę 69.3% →
71.4%, heuristic vs aggro nieznacznie w dół 61.1% → 59.0%); (2) do
macierzy doszła talia `real-batch4` z Maulerami {5}{B}{B}, których wczesny
cycling obniża win-rate heurystyki względem bezpośredniego aggro. Historyczny
pomiar po Batchu 3 (8 talii, 10 800 meczów): heuristic vs random 70.6%
(2540/3600), vs aggro 61.1% (2198/3600), aggro vs random 69.3%; próbka
576 meczów na parę: 68.8% vs random (198/288), 64.2% vs aggro (185/288).

Pomiar pośredni (Batch 3 przed pełnym bestow i naprawą instalacji talii):
67.4% vs random, 60.2% vs aggro, 69.0% aggro vs random. Poprawa wynika z
dwóch źródeł mierzalnych dosłownie tym harnessem: (1) instalacja talii
zachowuje już deskryptory `types`/`entersTapped`/`bestow` (wcześniej m.in.
landy ETB tapped nie wchodziły zatapnięte w prawdziwych partiach), (2) bot
heurystyczny umie zagrać Leafcrown Dryad za koszt bestow, gdy się to
opłaca. Historyczny pomiar z wdrożenia B0 (7 talii, 8400 meczów): 70.8%
vs random, 61.6% vs aggro, 73.4% aggro vs random.

Obserwacja z macierzy: talia `synthetic-abilities` jest zauważalnie silniejsza
od pozostałych (wygrywa nawet w rękach RandomBota), a `real-batch3` celowo
najsłabsza — pary z ich udziałem dowodzą głównie o sile TALII, nie o jakości
decyzji. Do oceny zmian bota liczy się przede wszystkim wynik zagregowany
oraz pary bez skrajnych talii.

## B1 — Lepsza heurystyka ✅ (zrealizowane 2026-08-02)

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

### Co weszło w B1

- **Świadomość kroków tury** — w własnych krokach untap/upkeep/draw/end/cleanup
  bot nie tapuje many (mana wyparuje na końcu kroku) ani nie aktywuje zdolności
  kosztem tapu. **Naprawia patologię deck-out**: wcześniej bot aktywował
  pump {T} Warboara w untap i beginning_of_combat, trzymając własne stwory
  zatapiane — na talii `synthetic-abilities` przegrywał z RandomBotem 0/10
  (wypalał własną bibliotekę, bo gra stała w miejscu).
- **Zegar** — bonusy do ataku: blisko lethal (enemy ≤ 10 życia), groźba
  śmierci w następnej turze (wyścig), pusta biblioteka (deck-out = trzeba
  skończyć grę atakiem).
- **Ocena planszy** — flying jako evasion przy ataku (omija blockerów bez
  flying/reach), parytet liczby stworów przy zagrywaniu permanentów,
  świadome ceny bloków (nie chumpujemy cennymi atakującymi bez presji
  śmiertelnej).
- **Wycena zdolności z definicji karty** (przez `cardId` → registry —
  wciąż generyczne deskryptory, zero nazw): pump = przyrost siły minus koszt
  tapu (combat trick tylko przy obronie), neutralizacja Liry = wartość celu
  (X=moc celu już wymuszane przez engine), equip z evasion/haste, cycling
  tylko dla kart dalekich od wyrzucenia, ninjutsu = delta siły + evasion.
- **Sekwencjonowanie i przewaga kart** — zachowane (land przed stworem,
  tap tylko przy czymś grywalnym, scry/backup jak dotąd); triggery
  (Zoraline, wilkołak) są w engine w pełni automatyczne — bot nie ma tam
  decyzji, więc nie ma czego punktować.

### Pomiar (B0, 9 talii, 50 seedów, 13 500 meczów)

| Para | Przed B1 | Po B1 | Δ |
|---|---|---|---|
| heuristic vs random | 67.4% (3035/4500) | **75.4%** (3393/4500) | +8.0 p.p. |
| heuristic vs aggro | 59.0% (2657/4500) | **60.9%** (2741/4500) | +1.9 p.p. |
| aggro vs random | 71.4% (3214/4500) | **71.4%** (3213/4500) | 0.0 p.p. |
| agregat heuristic | 63.2% (5692/9000) | **68.1%** (6133/9000) | +4.9 p.p. |

Niedokończone: 0 (przed i po). Największa zmiana per talia:
`synthetic-abilities | synthetic-abilities` 0% → **100%** (patologia deck-out),
`real-batch4 | real-batch4` 46% → 54%.

Próbka regresji (`REGRESSION_CONFIG`, 4 seedy): heuristic vs random
62.5% → **73.1%** (263/360), vs aggro 60.8% → **63.3%** (228/360);
progi w `test/bot-benchmark.test.js` podniesione do 0.58 / 0.48
(zmierzone −15 p.p.).

Po Batchu 5 (2026-08-02, 10 talii, 16 500 meczów, 0 niedokończonych):
heuristic vs random **77.1%**, vs aggro **60.4%**, aggro vs random **73.5%**,
agregat heuristic 68.8%. Próbka regresji (10 talii, 440 meczów/parę):
**74.8%** vs random, **63.2%** vs aggro; progi podniesione do 0.59 / 0.48.

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
