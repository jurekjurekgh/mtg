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

## Otwarte w PMSSB-67

- F3 (lifelink) i F4 (płaskie wagi) — w toku.
