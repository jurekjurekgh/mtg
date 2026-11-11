# Plan — zgłoszenia W (Basilisk Gate) i X (Fleeting Flight)

Data: 2026-11-11. Sesja `arena/76d4141f-mtg`, PR #184. Właściciel zgłosił dwie
uwagi z testów jako „znów wygląda na regresję" — obie dotąd naprawiane
(Basilisk Gate: M146; Fleeting Flight: Batch 69). Ten plan powstaje PO pomiarze
sondami, więc różni się od planu V: każdy punkt ma już świadka liczbowego.

## W — Basilisk Gate: bot buffuje stwora, który nie atakuje

**Objaw właściciela:** „Bot wykorzystuje jej zdolność specjalną (buff +x/+x
gdzie x to ilość bram) na kreaturę, która w ogóle potem nie atakuje. Powinien
buffować TYLKO kreaturę, która będzie atakować w combat."

**Co już jest w kodzie** (`heuristic-bot.js`, gałąź `activate_ability`,
`pump` + `sorceryPump`): mechanizm zgłoszenia M (2026-11-07) — `value -= 26`,
gdy odbiorca nie przejdzie `zamiarAtakuWybranego` (najlepszy zestaw atakujących
Z tym stworem musi bić najlepszy BEZ niego).

**Pomiar (sonda `.arena/probe-w-gate.mjs`, 2 bramy = X=2, stół 2/4 + 2/1):**

| scena | big | small | pass | wynik |
|---|---|---|---|---|
| bez blokerów | **3** | **3** | 0 | remis → bot bierze `big` z enumeracji |
| z blokerem 0/10 | −23 | −23 | **0** | bot nie aktywuje (poprawnie) |

Deklaracja ataku na TYM SAMYM stole (`.arena/probe-w-declare.mjs`): bez
blokerów bot atakuje OBA (`attack[big,small]` = 18 vs `attack[big]` = 13 vs
`attack[small]` = 13). Sumy mocy obu stworów są równe (2/4 i 2/1 → oba po 2),
więc `pump_by_gates` daje im identyczne +2/+2 i **żaden wariant nie wyróżnia
się w ocenie ataku**.

**Diagnoza:** to nie jest brak naprawy M, tylko **remis w modelu ataku**:
przy równych sumach mocy polityka ataku nie odróżnia `big` od `small`, więc
`zamiarAtakuWybranego` jest prawdziwy dla obu, a wybór rozstrzyga kolejność
enumeracji (2/4 pierwszy). Właściciel widzi to jako „buff na stwora, który nie
atakuje". Dwa realne defekty:

1. **W1 — remis nierozstrzygnięty deterministycznie.** Gdy oba warianty mają
   tę samą wartość, kreator bierze pierwszy z listy kandydatów, a nie tego,
   który REALNIE pójdzie do ataku (większe ciało / lepsza pozycja w planie).
   Wycena aktywacji musi rozstrzygać remis na korzyść odbiorcy z planu ataku.
2. **W2 — plan ataku nie premiuje przeżywalności.** Wybór zestawu atakujących
   przy równych sumach mocy ignoruje toughness (2/4 przeżywa blok, 2/1 nie).
   To ogólniejsze, ale dotyka też innych kart — **poza zakresem tego
   zgłoszenia** (właściciel zgłosił bramę, nie politykę ataku); zapisuję jako
   obserwację, nie naprawiam.

**Kryteria akceptacji:**
- W/1: gdy `pump_by_gates` remisuje między dwoma własnymi stworami, bot wybiera
  tego, który ma największą wartość w planie ataku (a nie pierwszego z listy).
- W/2: gdy żaden własny stwór nie atakuje, bot NIE aktywuje bramy (już działa —
  pin regresyjny).
- W/3: nie buffuje stwora przeciwnika (M146 — pin istnieje, dokładam mutację).

## X — Fleeting Flight: trik bojowy rzucany w podtrzymaniu

**Objaw właściciela:** „NIE MA PRAWA BYĆ RZUCANY w fazie podtrzymania. To jest
combat trick — tylko w fazie walki."

**Co już jest w kodzie** (zgłoszenie D, `counterInstantHoldPenalty = 120`):
kara 120 pkt za instant z trwałym licznikiem na własnym stworze poza oknem
walki, z wyjątkami (cel już walczy, blokujący-niespodzianka, domknięcie gry).

**Pomiar (sonda `.arena/probe-x-prog.mjs`, stół 1 stwór, upkeep/main1/end):**

| stwór | upkeep | main1 | end |
|---|---|---|---|
| 2/2 | −102 | −102 | −102 |
| 4/4 | −51 | −51 | −51 |
| 12/12 | −3 | −3 | −3 |
| **20/20** | **+215 → RZUCA** | **+215 → RZUCA** | +211 |

**Reprodukcja: TAK.** Przy 20/20 bot rzuca kartę w podtrzymaniu za 215 pkt.

**Diagnoza (arytmetyka):** `counterHostValue = counterBase + counterAmountWeight
+ counterHostWorthWeight × (2·power + toughness)` = `2 + 4 + 2·(2P+T)`. Dla
20/20: `6 + 2·60 = 126`. Kara jest **stała (120)**, premia **liniowa od ciała**
— dla ciała ≥ 19/19 premia przebija karę i trik wychodzi na plus. Kara
„nie działa" nie dlatego, że nie odpala (sonda z instrumentacją: wchodzi), ale
dlatego, że **skala jest nieproporcjonalna**.

**Poprawka (do decyzji przed kodem — dwie opcje):**
- (a) kara **proporcjonalna**: `max(counterInstantHoldPenalty, część premii
  z ciała)`, np. kara ≥ `counterHostWorthWeight × worth`, żeby zawsze przebijała
  motywację z samej wielkości ciała;
- (b) kara **mnożnikowa**: `× 1.5` wartości `counterHostValue`.

Obie są po deskryptorze, bez nazw kart (ADR 0002). Skłaniam się do (a): zasada
„okno jest treścią karty" nie zależy od rozmiaru celu; (b) osłabia karę dla
małych stworów, gdzie dziś działa poprawnie.

**Kryteria akceptacji:**
- X/1: 20/20 — upkeep = main1 = end (kara wchodzi bez względu na ciało).
- X/2: 12/12 i mniejsze — zachowanie bez zmian (żadnej regresji).
- X/3: okno walki (mój atakujący zadeklarowany, blok wroga) — rzuca (dziś 81).
- X/4: mutacja potwierdza, że pin czerwienieje po cofnięciu poprawki.

## Kolejność

1. [x] Pomiar sondami (W: 3/3 remis; X: próg 20/20) + plan (ten plik) + push.
2. Piny W/1–W/3, X/1–X/4 (RED na objawie).
3. Poprawki w `heuristic-bot.js` + ewentualny parametr w `heuristic-params.js`.
4. Mutacje, sąsiedzi (M146/Batch 69/D-instant/pumpBite/K6), `npm test`, build.
5. Dokumentacja (HISTORY, handoff), PR #184.

---

## WYNIK po logu właściciela (seed 424051) — KOREKTA DIAGNOZY POCZĄTKOWEJ

Plan wyżej powstał z moich sond. **Log właściciela pokazał, że dwie diagnozy
były złe** — zapis, żeby nikt ich nie „dokończył":

- W: nie chodziło o remis „2/4 vs 2/1". Prawdziwa przyczyna: `widokDlaWycenyAtaku`
  powstawał WYŁĄCZNIE w fazie walki (`phase === 'combat'`), a Basilisk Gate to
  zdolność sorcery-speed, więc jedyne legalne okno (Główna 1) dostawało `null`
  i wycena spadała na słaby `attackIntendsCreature` → wszystkie warianty 3 pkt.
  Dodatkowo `zamiarAtakuWybranego` pytał o maksima dwóch RÓŻNYCH rodzin
  podzbiorów (prawda dla niemal każdego stwora) — teraz pyta o jeden zwycięski plan.
- X: nie chodziło o 20/20. Prawdziwa przyczyna: smok **4/4** z „can't attack
  unless defending player controls a creature with flying", życie **5** →
  `closesGame` (4+1 ≥ 5) liczone słabym `canAttackNow` (tylko tap/choroba)
  zdejmowało karę. To samo słabe kryterium w `counterLethalClockBonus`.

### Zmierzone i WYCOFANE (regresje moich własnych poprawek)

- Kara proporcjonalna do ciała — czerwieniła pin **D/5** (zgłoszenie D:
  „2/2 z licznikami domyka grę przy życiu 4 — wolno rzucić przed atakiem")
  i **PMSSB-23/C4**. Kara zostaje stała.
- Wymuszenie `phase: 'combat'` w widoku sondy — mutant GREEN, nie wnosiło nic.
- Pin „20/20 w podtrzymaniu" — usunięty: nie było takiego przypadku u
  właściciela, a jest sprzeczny z D/5.

**Klasa „stała kara vs liniowa premia od ciała” — DECYZJA WŁAŚCICIELA
(2026-11-11): NIE NAPRAWIAĆ.** Kara `counterInstantHoldPenalty` zostaje stała
(120), a premia `counterHostValue` liniowa. Ciało ≥ 19/19 to scenariusz
nierealny w praktyce (właściciel: „możemy go pominąć”) i naprawa kolidowałaby
z pinem D/5 zgłoszenia D. **Nie „poprawiaj” tego z dobrej woli** — zmiana
wymaga nowej decyzji właściciela, nie zgłoszenia z gry. Zgłoszenie X było o
stworze BEZ MOŻLIWOŚCI ataku (4/4 z „can't attack”) i to jest naprawione.

### Bramy końcowe

`npm test` **10251/10251**, `npm run test:all` **10520/10520** (fail 0, 0 skipped),
build **79 modułów / 5832,2 kB**. Piny W/1–W/4, X/1–X/4 8/8; mutacje
mW1/mW3/mX1/mX3 → RED na wskazanych pinach.
