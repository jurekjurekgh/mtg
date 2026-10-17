# PMSSB-67 — caveaty PMSSB-64 (wycena słów kluczowych ciała)

Plan: [PLAN_2026-10-17h](../plans/PLAN_2026-10-17h-pmssb67-kw-caveaty.md). Sonda: `tools/pmssb67-kw-sonda.mjs`
(`--json`). Zlecenie właściciela: wszystkie cztery punkty z sekcji „Ograniczenia" raportu PMSSB-64,
każdy przez pełną pętlę PMSSB.

## Pomiar PRZED (wszystkie cztery punkty)

Wynik rzutu ciała z ręki (`cast_permanent`) minus ten sam rzut bez słowa, na tym samym stole.

- **F4 (płaskie wagi):** Δ dla każdego z dziewięciu słów (deathtouch 3.6, vigilance 3.6, first_strike
  2.7, double_strike 5.4, menace 2.7, trample 1.8, reach 1.8, indestructible 5.4, hexproof 2.7) jest
  IDENTYCZNE na wszystkich siedmiu stołach (pusty, bloker 4/5, bloker 1/1, dwa blokery, latający wróg,
  dwa duże ataki, 3 karty w ręce wroga) i przy mocy 3 i mocy 1. Wartość nie zależy od stanu ani mocy.
- **F3 (lifelink):** Δ = 1.8 przy życiu 20 i 4.5 przy życiu 4, niezależnie od stołu, także gdy bloker
  4/5 zabija ciało 3/3, a ono go nie zabija (ciało przestaje zarabiać po pierwszym ciosie).
- **F2 (Necrosquito):** prawdziwa karta 62.55; syntetyczny latający 2/2 MV4 69.60; vanilla 2/2 MV4 64.80.
  Karta, która wchodzi jako 2/2 z latającym, wyceniona niżej niż vanilla 2/2. Przyczyna: wycena czytała
  moc z karty (0) i pomijała liczniki wejścia (2 oil → +2/+2 przez pompę `oil_counters`).
- **F1 (pin MASS_EVASION):** kod poprawny, brak pinu. Maksimum wyniku Austere Command (foe 2/2 MV2 z
  danym słowem) minus vanilla: flying, reach, deathtouch, lifelink, first_strike, double_strike → Δ 4.00
  (= `massDestroyEvasionBonus`); vigilance, haste, trample, menace, hexproof → 0.

## F2 — liczniki wejścia w wycenie rzutu (PO)

Zmiana: `entryCounterStats(view, def)` w `heuristic-bot.js` (L41: używane w `cast_permanent` i `warp_card`,
oraz przez `creatureKeywordValue`). Liczy przyrost P/T od `entersWithCounters`:

- liczba → wprost; formuła stołu `other_creatures_you_control_plus_one` → `1 + inne stworzenia
  kontrolera na stole` (ta sama arytmetyka co `effects.js` przy wejściu);
- pompa statyczna `<nazwa>_counters` (np. `oil_counters`) → +1/+1 za każdy licznik `<nazwa>` z wejścia;
- licznik `+1/+1` z wejścia → wprost.

Karty bez takich liczników: przyrost 0, wycena bitowo identyczna (vanilla 2/2 = 64.8018 PRZED i PO).

| Pomiar | PRZED | PO |
|---|---|---|
| Necrosquito (2 oil) | 62.55 | 70.05 |
| latający 2/2 MV4 (syntetyczny) | 69.60 | 69.60 |
| vanilla 2/2 MV4 | 64.80 | 64.80 |
| Sheriff of Safe Passage, 0 własnych stworzeń | 62.996 | 65.696 |

Różnica Necrosquito 70.05 − latający 2/2 69.60 = 0.45 pochodzi od mechanizmu „+1/+1 za każdy zabity
sojuszniczy stwór" (trigger dies-growth). Nie mierzony osobno; jest mały i jest wartością zdolności,
nie błędem wejścia.

**Re-pin (świadomy, z przyczyną):**
- `test/pmssb10-ogon-wave-b2.test.js`: necrosquito 62.55 → 70.05 (pin kodował ciało 0/0).
- `test/audyt-pmssb35-odroczenie.test.js` (A1): Sheriff 62.996 → 65.6964 (Sheriff wchodzi z licznikiem
  „1 + inne stworzenia"; pin kodował 0/0).

**Testy:** `test/audyt-pmssb67-necrosquito.test.js` (4): wyżej niż vanilla (RED przed zmianą: 62.55 < 64.80,
potwierdzone przez `git show HEAD:` w katalogu roboczym); ≈ latający 2/2; anty-over-fix vanilla 64.8018;
Sheriff z 0/1/2 własnymi stworzeniami rośnie liniowo (dowód, że formuła stołu liczy stwory).

**Bramy (F2):** `npm test` 8455/8455, EXIT 0 (golden master bez regeneracji — żadna decyzja w snapshotcie
nie zmieniła wyboru); `npm run build` EXIT 0; `cr-numery --sprawdz` OK.

**Błąd po drodze (naprawiony, zapis dla uczciwości):** pierwsza wersja helpera dodawała łańcuch
`other_creatures_you_control_plus_one` do liczby → NaN w teście A2 (`darmowy rzut = płatny + koszt`). Naprawiono
przez rozwiązanie formuły tak jak w silniku, nie przez wyjątek dla Sheriffa.

## F1 — pin na MASS_EVASION_KEYWORDS (PO)

Zmiana w kodzie: brak (pomiar PRZED pokazał poprawne zachowanie). Dodany pin:
`test/audyt-pmssb67-masowe.test.js` (11): 6 słów z listy → Δ = `massDestroyEvasionBonus`; 5 spoza listy → Δ 0
(anty-over-fix). **Dowód czułości:** wariant z literówką `'first strike'` (regresja PMSSB-63) → test
`first_strike` pada (1 z 11); po przywróceniu 11/11. Plik przywrócony bajt w bajt (`cmp`).

## F3 — lifelink a zabójcy na stole (PO)

Zmiana: `creatureKeywordValue` (heuristic-bot.js): `lifelinkSurvival = 1 − (1 − creatureKwLifelinkSurvivalFloor) × udział zabójców`.
Zabójca = wrogie stworzenie o mocy (`combatPower`) ≥ wytrzymałość ciała (z licznikami wejścia, spójnie z F2).
Parametr `creatureKwLifelinkSurvivalFloor = 0.5` (`heuristic-params.js`, klucz na liście, komentarz z uzasadnieniem).

| Stół (Δ lifelinku, ciało 3/3) | PRZED | PO |
|---|---|---|
| pusty, życie 20 | 1.80 | 1.80 |
| bloker 4/5 (zabija 3/3, sam przeżywa) | 1.80 | 0.90 |
| bloker 1/1 (nie zabija) | 1.80 | 1.80 |
| dwa atakujące 5/5 (zabójcy 2/2) | 1.80 | 0.90 |
| życie 4, pusty / bloker 4/5 | 4.50 / 4.50 | 4.50 / 2.25 |

Mieszany stół (1 zabójca + 1 nie-zabójca) → 0.75 × pusty (test). Pokrętło 1 → dawne zachowanie (test).

**Testy:** `test/audyt-pmssb67-lifelink.test.js` (6). **Dowód czułości:** wyłączenie mnożnika w kodzie → 3 testy
zabójcy padają; przywrócenie `cmp` bajt w bajt, 6/6.

**Bramy (F3):** `npm test` 8472/8472 EXIT 0 (golden master bez regeneracji). Lustro (`pmssb66-mirror.mjs 40`):
3000 → 159:161, 5000 → 162:158, 9000 → 163:157, nierozegrane 0 (bez zmiany względem Ad 2).

**Granice:** zabójca liczony po mocy i wytrzymałości, nie po sile walki (bez first strike/deathtouch atakującego).
Blokujący zabójca nie jest odróżniany od atakującego — to ta sama wartość ryzyka.

## F4 — płaskie wagi 9 słów kluczowych (PO)

| Słowo (waga W) | pusty | bloker 4/5 | bloker 1/1 | dwa blokery 2/2 | latający wróg | dwa ataki 5/5 | 3 karty w ręce wroga | wróg 3/3 |
|---|---|---|---|---|---|---|---|---|
| deathtouch (4) | 1.8 (3.6) | 2.4 (3.6) | 1.8 (3.6) | 1.8 (3.6) | 1.8 (3.6) | 3.0 (3.6) | 1.8 (3.6) | 1.8 |
| vigilance (4) | 1.8 (3.6) | 2.16 (3.6) | 1.89 (3.6) | 2.16 (3.6) | 1.98 (3.6) | 2.7 (3.6) | 1.8 (3.6) | 2.07 |
| first_strike (3) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 2.7 |
| double_strike (6) | 5.4 (5.4) | 2.7 (5.4) | 5.4 (5.4) | 5.4 (5.4) | 5.4 (5.4) | 2.7 (5.4) | 5.4 (5.4) | 5.4 |
| menace (3) | 2.7 (2.7) | 2.7 (2.7) | 2.7 (2.7) | 2.02 (2.7) | 2.7 (2.7) | 2.02 (2.7) | 2.7 (2.7) | 2.7 |
| trample (2) | 0.9 (1.8) | 0.9 (1.8) | 1.5 (1.8) | 1.2 (1.8) | 1.2 (1.8) | 0.9 (1.8) | 0.9 (1.8) | 0.9 |
| reach (2) | 0.9 (1.8) | 0.9 (1.8) | 0.9 (1.8) | 0.9 (1.8) | 1.8 (1.8) | 0.9 (1.8) | 0.9 (1.8) | 0.9 |
| indestructible (6) | 2.7 (5.4) | 3.6 (5.4) | 2.7 (5.4) | 2.7 (5.4) | 2.7 (5.4) | 4.5 (5.4) | 5.4 (5.4) | 3.6 |
| hexproof (3) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 1.35 (2.7) | 2.7 (2.7) | 1.35 |

Wartości to Δ rzutu ciała 3/3 (moc 3) z danym słowem, ×0.9 wagi rodziny. W nawiasie PRZED (płasko). Kolumna
„wróg 3/3" nie była mierzona PRZED — dodana po pomiarze, żeby sprawdzić pierwszy cios.

**Model:** `floorShare(x) = creatureKwStateFloor + (1 − creatureKwStateFloor)·x`, x ∈ [0,1]. Próg 0.5, normalizator
`creatureKwRefThreat = 3`. Per słowo (`creatureKeywordValue`, heuristic-bot.js):

- deathtouch: `W × floorShare(wrogowie, których nie pokonujemy (wytrzymałość > nasza moc) / 3)`
- vigilance: `W × moc/3 × floorShare(presja wroga / życie)` (presja = `enemyAttackPower`)
- first_strike: `W × moc/3 × floorShare(wrogowie, którzy nas zabiją, a których my zabijemy pierwsi / liczba wrogów)`
- double_strike: `W × moc/3 × floorShare(wszyscy wrogowie, których pokonujemy / liczba wrogów; bez wrogów = 1)`
- menace: `W × moc/3 × floorShare(1 / liczba untapped blokerów)`
- trample: `W × moc/3 × floorShare(nadwyżka (moc − najlepszy bloker) / moc; bez blokerów 0)`
- reach: `W × floorShare(1 jeśli wróg ma latającego, inaczej 0)` (bez skali mocą: blok, nie zadane obrażenia)
- indestructible: `W × moc/3 × floorShare((karty w ręce wroga + zabójcy) / 3)`
- hexproof: `W × moc/3 × floorShare(karty w ręce wroga / 3)`

Karty w ręce wroga: widok ukrywa je jako obiekty z `controllerId` wroga (ta sama reguła co `handSizeOf`).

**Odstępstwo (świadome):** słowa z `powerScale` (double strike, trample, vigilance, first strike, menace,
indestructible, hexproof) dla mocy 1 są wyraźnie niższe niż dawne płaskie wartości (np. vigilance 0.6 zamiast 3.6).
Wzorzec jest ten sam co latanie i tempo (PMSSB-64, `creatureKwRefPower`): zadane obrażenia skalują się mocą.
Dawna wartość płaska dla ciała 1/1 była zawyżona. Guard M429(c) (brak inwersji) jest spełniony: wartości rosną
z mocą i ze stanem, a żadne słowo nie daje wyższej wartości słabszemu ciału.

**Pokrętła:** `creatureKwStateFloor = 1` przywraca płaskie wartości (test). `creatureKwRefThreat` steruje normalizacją liczby zagrożeń.

**Testy:**
- `test/audyt-pmssb67-flat.test.js` (10): stosunek Δ(stół)/Δ(pusty) dla każdego słowa; pokrętło ×1.
  **Mutacja** (`floorShare = 1`, czyli płasko): 8 z 10 pada; przywrócenie `cmp` bajt w bajt, 10/10.
- `test/audyt-pmssb64-keywords.test.js` (20): pin „pokrycie" przepięty z `Δ = waga × 0.9` na `× 0.9 × udział`
  (pusty stół = próg; wyjątki double strike i menace = pełna wartość przy braku wrogów). Dokładny wzór, nie osłabienie.

**Re-pin (świadomy, z przyczyną; każda wartość zgodna z formułą, rozpisana w komentarzu):**

| Plik | Pin | PRZED | PO | Przyczyna |
|---|---|---|---|---|
| audyt-batch53 CR1 | Acidic Slime deathtouch | 3.6 | 1.8 | pusty stół, próg |
| audyt-pmssb35 A1 | Paladin 5/4 | 79.2072 | 78.9072 | trample ×5/3 ×0.5 |
| audyt-pmssb60 E1 | Engulfer, wróg latający | 81.909 | 83.109 | trample ×6/3 przy 2/2 blokerze |
| audyt-pmssb60 E2 | Engulfer, wróg bez latania | 79.209 | 79.509 | reach ×0.5, trample jw. |
| audyt-pmssb60 E3 | Engulfer, bez wrogów | 75.609 | 74.709 | reach ×0.5 |
| audyt-pmssb60 E1 (kontrfaktyk) | Engulfer, wróg latający, bez zakazanej zdolności | 79.209 | 80.409 | reach w pełnej wartości (wróg-latający); pin w tym samym stanie co E1 |
| audyt-pmssb60 F6 | Zoraline, wróg 3/3 | 86.4036 | 84.8736 | czujność × presja 3/20 |
| pmssb4 wave-a F-A2 | Paladin@20 | 73.8072 | 73.5072 | trample jw. |
| pmssb4 wave-c F-C3 | Zoraline bez bata | 77.4036 | 75.6036 | czujność, pusty stół |
| pmssb4 wave-c F-C3 | Zoraline z batem | 78.3036 | 76.5036 | czujność, pusty stół |
| pmssb9 wave-a F-T1 | prowler (deathtouch) | 71.1 | 69.3 | pusty stół |
| pmssb9 wave-a F-T1 | prowler-lib0 | 14.4 | 12.6 | pusty stół |
| pmssb9 wave-b F-T2 | caves (trample) | 78.8 | 78.5 | trample jw. |
| pmssb9 wave-b F-T2 | veteran (czujność, moc 2) | 72.0 | 69.6 | czujność ×2/3 |
| pmssb9 wave-b F-T2 | zoraline | 77.4 | 75.6 | czujność, pusty stół |
| pmssb9 wave-b guard | prowler | 71.1 | 69.3 | pusty stół |

Uwaga do E1-kontrfaktyka: pierwotnie `kontra` (wróg z latającym) był porównywany do `SKY_BAZA` (wróg bez latania).
To były dwa różne stany. Przed F4 reach był płaski, więc wartości się zgadzały (79.209). Teraz nie, i pin mówi to wprost.

**Golden master (poprawka).** `npm test` = `run-tests.mjs fast`, który POMIJA pliki z zestawu `slow`
(w tym `bot-scoring-snapshot.test.js`). Pełną bramą jest `npm run test:all`. Moje wcześniejsze zdanie „npm test zielony"
dla F2 i F3 nie obejmowało więc golden mastera. Zostało to wykryte w `test:all` (2 padnięcia: `2318`, `2319`).

Dump diff (`tools/bot-scoring-snapshot.mjs --dump`, baza = `7338ff2` przed PMSSB-67; porównanie własnym `cmpdump`,
1221 decyzji w 6 partiach):

| Krok (skumulowany względem 7338ff2) | Zmiana wyboru | Zmiana wyniku wybranej | Zmiana innych opcji | Maks. Δ |
|---|---|---|---|---|
| F2 `26cd540` | 0 | 0 | 0 | 0 |
| F3 `493c30d` | 0 | 1 | 1 | 0.9 |
| F4 (bieżący) | 0 | 7 | 2 | 2.4 |

Szczegóły zmian (wszystkie `cast_permanent` ciał z dotkniętym słowem; wybór pozostał ten sam):
- F3: `tarkir-bg|warhammer-ubr` seed 1000 T8, `p1-opening-0` 65.70 → 64.80 (−0.9; zmiana z kroku F3 `lifelinkSurvival`; karty nie zidentyfikowano w zapisie, więc przypisanie do lifelinku jest hipotezą). Ta sama zmiana utrzymuje się w F4.
- F4 (nowe względem F3): `ravnica|innistrad-wu` s1000 T22 (drawn-28, 65.70 → 64.80); s1000 T24 (drawn-101, 72.00 → 69.60, −2.4);
  s1001 T13 (drawn-49, 71.10 → 68.70, −2.4); `dominaria-brg|mirrodin-wu` s1001 T9 (drawn-20, 67.50 → 66.60, −0.9)
  i T13 (drawn-49, 66.60 → 65.70, −0.9); `tarkir-bg|warhammer-ubr` s1001 T3 (drawn-3, 67.50 → 65.70, −1.8).
Razem F4 dotyka 6 decyzji (7 pozycji z tabeli minus 1 zmiana F3).

Kierunek (w dół) i skala (−0.9 … −2.4) są zgodne z tym, że F4 obniża płaskie wagi słów na małych ciałach lub przy słabym stole. Nie zweryfikowano każdej delty do pełnej formuły karty; to jest krok do zrobienia w razie wątpliwości.
**Decyzja:** fixture zregenerowany (`--write`, `overallHash` 90aa7806… → 2fe4b347…). Podstawa: 0 zmian wyboru, a zmiany
wyniku tylko tam, gdzie formuła F4 je przewiduje. Wąska próbka (6 partii), więc to NIE jest dowód na brak wpływu na grę.
Wpływ na grę mierzy lustro (niżej).

**Lustro (`tools/pmssb66-mirror.mjs 40`):** 3000 → **157:163** (PRZED 159:161), 5000 → 162:158 (bez zmian),
9000 → 163:157 (bez zmian); nierozegrane 0 we wszystkich (960 partii). Zmiana w jednym zakresie to 2 wygrane z 320,
czyli w granicach szumu. Nie uznaję jej za sygnał ani za poprawę. Pomiar wpływu na grę wymagałby większej próby.

## Otwarte w PMSSB-67

- **Próg latania dla ciała o mocy 0 (decyzja właściciela).** Sprawa: `creatureKwFlyingFloor = 3` (PMSSB-64) daje latającemu
  ciału o mocy 0 wartość 3 (`max(3, 8·moc/3)`). Necrosquito (`card-data.js` ~5754) ma moc 0 w definicji i rośnie
  o oil, więc przy wejściu jest 2/2. Wynik 70.05 vs syntetyczny latający 69.60: różnica 0.45 pochodzi z
  wzrostu oil, którego sonda nie mierzy. Nie zmieniam progu bez dowodu taktycznego.
  **Rekomendacja:** zostawić 3. Latające ciało z mocą 0 nadal blokuje latające i zasłania, więc 0 byłoby
  zaniżeniem. Gdyby właściciel chciał skalować próg do mocy, potrzebny jest pomiar z oil (sonda rozszerzona o licznik).
- **Rejestr PMSSB** (`docs/PMSSB.md`, `docs/PROJECT_HISTORY.md`): wpisane w tym samym commicie co ten raport.
- **F2 i F3 w bramach:** `test:all` przeszedł dla stanu ze wszystkimi F2–F4 (`21a5568`, 8749/8749). Osobnego `test:all`
  dla samego F2 czy F3 nie uruchamiano; dump diff pokazuje F2 = 0 zmian, F3 = 1 zmiana wyniku.
