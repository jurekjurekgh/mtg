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

### Status: infrastruktura gotowa, eksperyment nie przeszedł progu jakości (2026-08-02)

**Co powstało (fundament pod B2-w2):**

- `src/engine/lookahead.js` — `makeSimulate(state)`: wykonuje kandydata na
  `structuredClone` stanu i dogrywa scenariusz polityką (funkcja dostarczana
  przez wywołującego — engine nie zna kontrolerów, ADR 0004). Horyzont:
  `combat` (do rozstrzygnięcia walki) / `main_phase` (do końca własnej fazy
  main) / limit komend. Deterministyczne (ADR 0005, zero `Math.random`);
  bezpiecznik try/catch na brzegowe przypadki engine (śmierć uczestnika
  combatu od czaru przed rozstrzygnięciem). `runSimulation` przekazuje
  `helpers.simulate` jako drugi argument `chooseCommand` (kompatybilne wstecz).
- `createHeuristicBot({ lookahead: 1 })` — opcja (domyślnie **0**): top-K
  kandydatów strategicznych dogrywanych symulacją, score = B1 + waga × delta
  ewaluacji liścia (życie/plansza/ręka/biblioteka + wygrana/przegrana).
- Testy `test/bot-lookahead.test.js` (8): determinizm, brak mutacji oryginału,
  odrzucanie nielegalnych komend, unikanie złej wymiany (5/1 w 3/3), smoke.

**Wynik pomiaru (B0, próbka 10 seedów, 3300 meczów, 10 talii):**

| Wariant | vs random | vs aggro |
|---|---|---|
| baseline B1 (bez lookahead) | 76.5% | 60.2% |
| lookahead pełny (topK 3, max 12, waga 3) | 70.3% | 57.4% |
| lookahead osłabiony (topK 2, max 8, waga 1, bez ataku w wyścigu) | 68.6% | 55.9% |
| lookahead tylko atak | 75.6% | 58.6% |
| lookahead z progiem |delta|≥2 | 69.5% | 55.8% |

**Wniosek:** lookahead z polityką greedy zbyt często rezygnuje z ataków
(obrońca w symulacji blokuje optymalnie), a w małych taliach benchmarku
(deck-out) presja ataku jest więcej warta niż „optymalna" ewaluacja wymian.
Zgodnie z zasadą B0 (nowy bot nie może być słabszy) lookahead **pozostaje
domyślnie wyłączony**; infra i testy zostają jako fundament. B2-w2 wymaga
przeprojektowania ewaluacji (np. termin „do końca tury", kara za brak presji
przy małej bibliotece, planowanie 1–2 tur zamiast jednej sceny) i ponownego
pomiaru tym samym harnessem.

## B3 — Modelowanie przeciwnika (prawdopodobieństwa) ✅ (zrealizowane 2026-08-02)

Talie OBU graczy są znane (`decks/*.txt`, `REPO_DECKS`), a engine śledzi
strefy — bot może liczyć prawdopodobieństwo (rozkład hipergeometryczny),
że przeciwnik trzyma odpowiedź/removal, i kalkulować EV zagrań. Do tego
adaptacja do obserwowanego zachowania (blokuje? tapuje się do zera? trzyma
instant?).

### Co weszło

- **`src/engine/hypergeom.js`** — deterministyczne `probAtLeastOne(N, K, n)`
  (rozkład hipergeometryczny liczony iteracyjnie, bez silni; ADR 0005);
- **bot (`opponentDeck`)** — benchmark i sesja przekazują talie obu graczy;
  bot klasyfikuje karty przeciwnika generycznie po efektach (instant z
  `damage` = removal, z `pump` = combat trick) — zero nazw kart (ADR 0002);
- **model ręki przeciwnika** — N = biblioteka + ręka, K = kopie „odpowiedzi"
  minus kopie w strefach publicznych (bitwisko/grób/exile/stos), n = ręka.
  **Adaptacja**: K maleje z każdą zagraną/odrzuconą kartą widoczną w strefach
  — model sam aktualizuje się w trakcie partii;
- **EV ataku** — gdy przeciwnik ma otwartą manę na removal i P(≥1 w ręce)
  > 45% (i nie jesteśmy w wyścigu — lekcja B2), atak wartościowym stworem
  dostaje karę ≈ wartość stwora × prawdopodobieństwo;
- **EV bloku** — gdy nasz blok zabiłby atakującego, a przeciwnik może mieć
  pump-instant i otwartą manę, blok jest karany (pump ratuje atakującego
  i zabija nasz bloker); pod presją śmiertelną blokujemy mimo ryzyka.

### Pomiar (B0, 11 talii, 50 seedów, 19 800 meczów, 0 niedokończonych)

| Para | Przed B3 | Po B3 | Δ |
|---|---|---|---|
| heuristic vs random | 74.7% | **74.5%** | −0.2 p.p. (szum) |
| heuristic vs aggro | 58.6% | **58.6%** | 0.0 p.p. |
| aggro vs random | 73.2% | **73.2%** | 0.0 p.p. |

Próbka regresji: 72.5% vs random, 62.5% vs aggro (baseline 72.7%/62.5%).
Wniosek: B3 jest **neutralny wobec botów benchmarku** (random/aggro nie
trzymają odpowiedzi strategicznie), a wartość ujawnia się w grze z
człowiekiem, który świadomie trzyma removale/pumpy i ma otwartą manę.
Progi bez zmian (0.59/0.48). Testy: `test/hypergeom.test.js` (4),
`test/bot-opponent-model.test.js` (7 — wstrzymanie ataku przy removal,
atak bez many, brak kar bez czarów w talii wroga, wyścig, blok vs pump,
determinizm).

## B4 — Strojenie wag heurystyki ✅ (zrealizowane 2026-08-03)

Pierwsza część B4 została wykonana jako deterministyczny hill-climbing na
win-rate z B0. Tuner jest narzędziem offline i nie trafia do artefaktu stołu:

- `src/controllers/heuristic-weights.js` przechowuje jawny kontrakt siedmiu
  rodzin decyzji (`land`, `mana`, `permanent`, `spell`, `ability`, `attack`,
  `block`) oraz waliduje konfigurację; wartość `1` zachowuje poprzednie
  zachowanie;
- `createHeuristicBot({ weights })` stosuje mnożniki wyłącznie do punktacji
  komend, bez zmiany reguł engine, protokołu, FoW ani interfejsu kontrolera;
- `tools/tune-bot.mjs` testuje warianty `±step` w stałej kolejności, używa
  tego samego `runBenchmark` co regresja i przyjmuje kandydata tylko wtedy,
  gdy nie pogarsza żadnej z par (`heuristic vs random`, `heuristic vs aggro`)
  względem baseline'u oraz poprawia średnią funkcję celu;
- testy `test/bot-tuning.test.js` pilnują walidacji, determinizmu, braku mutacji
  i odrzucania niedokończonych/gorszych wariantów. Uruchomienie lokalne:
  `npm run tune-bot -- --seeds 4`; przed PR wynik należy potwierdzić pełną
  macierzą `npm run benchmark`.

Wagi przyjęte po pomiarze (13 talii, 50 seedów, 27 300 meczów, 0 niedokończonych):
`mana=1.1`, `permanent=0.9`, pozostałe `1.0`.

| Para | Baseline przed B4 | Po B4 |
|---|---:|---:|
| heuristic vs random | 7 081/9 100 = 77.8% | **7 086/9 100 = 77.9%** |
| heuristic vs aggro | 5 790/9 100 = 63.6% | **5 821/9 100 = 64.0%** |
| aggro vs random | 6 873/9 100 = 75.5% | 6 873/9 100 = 75.5% |

Próbka regresji po B4 (728 meczów/parę): 547/728 = 75.1% vs random oraz
492/728 = 67.6% vs aggro; progi podniesiono do `0.60` / `0.52` zgodnie
z regułą „zmierzone −15 p.p." i zasadą „tylko w górę".

Po wejściu Batchu 9 (14 talii, 50 seedów, 31 500 meczów, 0 niedokończonych)
heuristic osiągnął **78.9% vs random** (8 281/10 500), **65.4% vs aggro**
(6 865/10 500), a aggro **76.6% vs random** (8 048/10 500). Próbka regresji
(840 meczów/parę) dała 641/840 = 76.3% vs random oraz 576/840 = 68.6% vs
aggro; progi podniesiono do `0.61` / `0.53` (random/aggro). Zmiany bota były
wyłącznie generyczne: zwykły cycling dobiera kartę, a aktywowane tworzenie
tokenu ma wycenę deskryptora.

Po Batchu 10 (15 talii, 50 seedów, 36 000 meczów, 0 niedokończonych) heuristic
osiągnął **81.0% vs random** (9 719/12 000), **64.3% vs aggro**
(7 722/12 000), a aggro **78.7% vs random** (9 449/12 000). Próbka regresji
(960 meczów/parę) dała 79.1% / 67.2%; próg random podniesiono do `0.64`,
aggro pozostawiono na `0.53` (tylko w górę). Zmiany bota dotyczą wyłącznie
ogólnych deskryptorów plot/tokenów i nie włączają lookahead.

Pozostają opcjonalne, niepodjęte kierunki B4: MCTS/self-play albo model
policy/value. Ewentualna zależność ML nadal wymaga osobnego ADR i musi spełnić
warunek właściciela: stół działa lokalnie z pliku oraz z GitHub Pages na
iPadzie/iPhonie bez instalowania czegokolwiek.

## B5 — Trudności i UX

- **Rozstrzygnięcie właściciela (2026-08-01):** „rozumowanie" bota ma być
  widoczne w OSOBNYM okienku stołu (ze śladu `trace()` → „dlaczego bot
  zagrał X"), **domyślnie zwiniętym**, a docelowo rozwiniętym. Poziom
  trudności bota: **maksymalny dostępny** (bez sztucznego osłabiania;
  ewentualny wybór talii/przeciwnika po stronie UI).
- Przydatne właścicielowi do testów i debugowania.

### Okienko rozumowania — zrealizowane (2026-08-02)

- Nowy panel stołu **„Rozumowanie bota"** (obok Logu partii i zapisu),
  `<details>` **bez `open` → domyślnie zwinięty**; po rozwinięciu pokazuje
  „dlaczego bot zagrał X".
- Sesja zbiera ślad decyzji bota: po każdym ruchu zapisuje najnowszy wpis
  z `trace()` bota (`{ turn, step, chosen, score, options }`), bufor 60,
  czyszczony przy wznowieniu zapisu (świeży bot). Boty bez `trace()`
  (aggro/random) nie psują sesji — panel pokazuje „Brak danych".
- Render (`renderTableView`) wypełnia panel i licznik decyzji; wpis ma
  postać: `T3 · Faza główna — Zagranie landa (ocena 90); najlepsza z 3
  opcji. Alternatywy: Zagranie permanentu (70), Pass priorytetu (0).`
  — czyli wprost „wybrano opcję o najwyższej ocenie" (heurystyka B1).
- Bez zmian w engine, protokole i bocie — czysta warstwa UX; benchmark
  nietknięty (bez pomiaru, bo to nie zmiana bota). Testy:
  `test/bot-reasoning.test.js` (8: formatowanie, zbieranie śladu w sesji,
  render + licznik, brak kontenera nie psuje renderu, panel domyślnie
  zwinięty).

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
