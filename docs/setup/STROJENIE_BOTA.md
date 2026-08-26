# Strojenie Bota — deskryptorowe strojenie evolucyjne (Etap B6)

Nowy typ zadania sesji, obok „Żywego Testera stołu" (docs/setup/TESTER_STOLU.md).
Podczas gdy Żywy Tester szuka BŁĘDÓW poprawności, Strojenie Bota szuka lepszych
WYCEN zagrań — dostraja parametry heurystyki bota, żeby grał mądrzej, nie
zmieniając reguł gry.

## Po co to jest

Bot heurystyczny (`src/controllers/heuristic-bot.js`) wycenia każdą legalną
komendę funkcją `scoreCommand` i wybiera najlepszą. Historycznie wyceny były
„magicznymi liczbami" wprost w kodzie (baza stwora 70, baza czaru 50, +15 za
removal…). Etap B6 wyciąga te stałe do NAZWANEGO wektora parametrów
deskryptorowych (`src/controllers/heuristic-params.js`) i pozwala je stroić
metodą evolucyjną (hill-climbing) OFFLINE — bez łamania architektury:

- **ADR 0002** — parametry grupują się po DESKRYPTORACH efektu (creature, spell,
  aura, surge, manifest…), nigdy po nazwie/ID karty. Wynik strojenia „jednej
  karty" generalizuje na przyszłe karty z tą samą mechaniką.
- **ADR 0005** — strojenie i inferencja są deterministyczne (bez `Math.random`,
  bez zegara).
- **ADR 0008** — czysty JS, zero zależności ML; hill-climbing/coordinate search,
  nie sieć neuronowa.
- Bot w runtime pozostaje interpretowalny (panel „Rozumowanie bota"), co jest
  częścią metody wykrywania błędów.

## Dwie warstwy strojenia (nie mylić)

1. **Wagi rodzin** (`heuristic-weights.js`, Etap B4) — 7 GLOBALNYCH mnożników
   całych rodzin komend (`land`, `mana`, `permanent`, `spell`, `ability`,
   `attack`, `block`). Grube pokrętła. Tuner: `tools/tune-bot.mjs`.
2. **Parametry deskryptorowe** (`heuristic-params.js`, Etap B6) — KONKRETNE
   stałe wyceny (baza stwora, mnożniki mocy/wytrzymałości, baza czaru…). Drobne
   pokrętła. Tuner: `tools/tune-card.mjs` (tryb jednej karty).

Obie warstwy współistnieją i mnożą się (parametr bazowy × waga rodziny). Wartość
domyślna każdego parametru == dawna stała, więc bot bez strojenia zachowuje się
IDENTYCZNIE jak przed B6.

## Sieć bezpieczeństwa: golden-master

`test/bot-scoring-snapshot.test.js` zamraża ślad decyzji bota
(`trace()`) na ustalonych partiach. Rola: dowód, że REFAKTOR (wyciąganie stałej
pod nazwę) niczego nie zmienia przy parametrach domyślnych — musi być ZIELONY
przez cały refaktor.

- Regeneracja po ŚWIADOMEJ zmianie parametrów domyślnych:
  `node tools/bot-scoring-snapshot.mjs --write`
- Diagnostyka różnicy (pełne ślady): `node tools/bot-scoring-snapshot.mjs --dump slad.json`

To golden-master REFAKTORU, nie miernik jakości. Jakość mierzy benchmark
(`test/bot-benchmark.test.js`, win-rate).

## Procedura: dodanie nowej rodziny parametrów (refaktor, T1)

Rób to gdy chcesz stroić mechanikę, której stałe są jeszcze „magiczne" w kodzie.
JEDNA rodzina = JEDEN commit (ADR 0020, zakaz wielkiego commita).

1. Znajdź stałe danej rodziny w `scoreCommand` (np. `grep -n "score += 15" …`).
2. Dopisz klucze do `HEURISTIC_PARAM_KEYS` i `DEFAULT_HEURISTIC_PARAMS`
   (`heuristic-params.js`); wartość domyślna == dawna stała co do punktu.
3. Podmień literały na `P.<klucz>` w `scoreCommand`. NIE ruszaj logiki
   generycznej (gałęzi, warunków) — tylko liczby.
4. Dopisz rodzinę do `DESCRIPTOR_PARAMS` w `tools/tune-card.mjs` pod właściwy
   deskryptor.
5. Uruchom golden-master: `node --test test/bot-scoring-snapshot.test.js` — musi
   być ZIELONY (defaulty nic nie zmieniły).
6. Dopisz do `test/bot-params.test.js` test, że niedomyślna wartość REALNIE
   wpływa na wycenę (pokrętło nie jest atrapą) — RED→GREEN (L61): cofnij
   wpięcie, test czerwienieje.
7. `npm test` + `npm run build` zielone → commit `M<n>/<k>: B6 T1 — rodzina <x>`.

## Procedura: strojenie karty/mechaniki (T4)

1. Wybierz kartę (zwykle świeżo dodaną w Batchu) i sprawdź, co da się stroić:
   ```
   node tools/tune-card.mjs --card <cardId> --seeds 2 --rounds 1
   ```
   Narzędzie wypisze `plan`: wykryte deskryptory, `tunableParams`,
   `descriptorsWithoutParams` (mechaniki bez parametrów — najpierw zrób dla nich
   T1) i talie zawierające kartę.
2. Właściwe strojenie na WIĘKSZEJ puli seedów (mniejszy overfitting):
   ```
   node tools/tune-card.mjs --card <cardId> --seeds 12 --rounds 2 --json wynik.json
   ```
   Ustalona pula seedów + wszystkie talie z tą kartą. Wynik: proponowane
   `params` + historia ewaluacji.
3. Jeśli karty nie ma w żadnej talii — dodaj ją do talii planu (patrz
   `tools/generate-plan-decks.mjs`) i powtórz.

## Procedura: PRZYJĘCIE nowych parametrów (adopcja, jak B4)

Tuner NICZEGO nie przyjmuje sam. Nowe wartości wchodzą do
`DEFAULT_HEURISTIC_PARAMS` RĘCZNIE, dopiero po dowodzie, że są lepsze:

1. Potwierdź poprawę PEŁNYM benchmarkiem (nie tylko zawężoną próbką karty):
   `npm run benchmark` (lub `node tools/benchmark.mjs --seeds 50`). Nowy wariant
   NIE MOŻE być słabszy na próbce regresji.
2. Wklej tabelę „przed/po" do opisu PR (praktyka B0).
3. Zmień `DEFAULT_HEURISTIC_PARAMS` na nowe wartości.
4. Zregeneruj golden-master: `node tools/bot-scoring-snapshot.mjs --write`
   (to ŚWIADOMA zmiana wyceny — golden-master ma teraz odbijać nowe zachowanie).
5. Podnieś progi w `test/bot-benchmark.test.js` regułą „zmierzone −15 p.p.,
   tylko w górę".
6. `npm test` + `npm run build` zielone → osobny commit
   `M<n>/<k>: B6 — przyjęcie parametrów <x> (benchmark +Y p.p.)`.

## Pułapki (z analizy teoretycznej)

- **Overfitting na jeden seed** — NIGDY nie stroisz na jednym seedzie; to znajdzie
  wycenę pod jedną rozdaną rękę. Zawsze pula seedów (domyślnie 6, przed
  przyjęciem 12+).
- **Credit assignment** — czysty win-rate to słaby sygnał na pojedyncze zagranie
  (tonie w szumie kilkudziesięciu innych decyzji). Kolejny etap (T2) doda gęstsze
  proxy (przewaga materialna/tempo w oknie tur) do funkcji celu; do tego czasu
  strój rodziny o wyraźnym wpływie i większą pulą seedów.
- **Detektor to hipoteza (L74/L75)** — „tuner podniósł wynik" na małej próbce to
  hipoteza, nie werdykt. Weryfikuj pełnym benchmarkiem przed przyjęciem.

## Pliki

- `src/controllers/heuristic-params.js` — wektor parametrów + walidacja.
- `src/controllers/heuristic-weights.js` — wagi rodzin (B4).
- `src/controllers/heuristic-bot.js` — `scoreCommand` czyta `P.*`.
- `tools/tune-card.mjs` — tryb jednej karty (T4).
- `tools/tune-bot.mjs` — strojenie wag rodzin (B4).
- `tools/bot-scoring-snapshot.mjs` + `test/fixtures/bot-scoring-snapshot.json` —
  golden-master.
- `tools/benchmark.mjs` — harness win-rate (przepływa `heuristicParams`).
- `test/bot-scoring-snapshot.test.js`, `test/bot-params.test.js`,
  `test/bot-tune-card.test.js` — testy B6.
