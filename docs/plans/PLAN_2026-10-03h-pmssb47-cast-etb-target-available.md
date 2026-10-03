# Plan PMSSB-47 (2026-10-03h): cast_permanent nie sprawdza dostępności celu ETB z add_counter na friendly — płaska premia także przy pustym stole

## Kontekst (wejście)

Kolejka z handoffu 03e: `warp_card` vs rzut w następnej turze, premia ewazyjna deathtouch/double strike.
Sonda `tools/probe-pmssb47-warp.mjs` dla Weftblade Enhancer (ETB: +1/+1 na up to 2 target creature):

| scenariusz | wybór bota | cast_permanent | warp_card | pass |
|---|---|---|---|---|
| A: 3 landy, 2/2 | pass | — (brak oferty) | -29 | 0 |
| B: 3 landy, 3/3 | warp | — (brak oferty) | +85 | 0 |
| C: 6 landów, 2/2 | cast_permanent | +71,1 | -89 | 0 |
| D: 6 landów, **0** stworów | **cast_permanent** | **+71,1** | -89 | 0 |

## Diagnoza

Porównanie:
- `warp_card` poprawnie liczy `warpEtbHostPayoff` z bramką `warpEtbHostMin=20` i
  przy braku godnego gospodarza stosuje `warpFutileEtbPenalty=90` (scenariusz A/D warp = -29/-89).
- `cast_permanent` natomiast woła `etbEnterBonusValue`, która w tabeli
  `ETB_EFFECT_BONUS.add_counter` zwraca stałe +6 jeżeli `req` jest niepusty
  i `etbFriendlyCounterTargetAvailable(view, req)` jest prawdziwe.
- **Błąd** w `etbFriendlyCounterTargetAvailable` (L1448): dla `spec.type === 'creature'`
  (bez podtypu i bez `notSelf`) funkcja zwraca `true` od razu — nawet przy
  PUSTYM stole, gdzie ENUMERATOR CELÓW (silnik) zezwala TYLKO na 0 celów
  (upTo), a wartość dodana z wejścia wynosi 0 (nie ma komu dać licznika).
  Bot daje +6 za trigger, który w praktyce da +0 liczników.
- W scenariuszu D rzut jest nadal opłacalny (3/4 za 6 many = 57,6 netto,
  bez premii ETB wyjdzie ~65, a z poprawnym liczeniem jeszcze niżej, ale wciąż
  dodatni — poprawny wybór NAD passem), lecz sama premia +6 zawyża ocenę i w
  innych scenariuszach (inna karta, słabsze ciało) może przechylić wybór
  w stronę rzutu, który nie daje żadnego bonusu z ETB.
- Dodatkowo: warp i cast używają RÓŻNYCH miar wartości celu ETB z licznikiem
  (warp liczy `counterHostValue` z bramką minimum, cast ma stałą 6) —
  asymetria; ale to nie jest bug w tym kształcie (warp to strata karty po
  EOT, więc cel musi być wart więcej; pozostawiamy świadomie, ADR 0022 §4).

## Naprawa (generyczna, ADR 0002)

1. **Popraw `etbFriendlyCounterTargetAvailable`** by zwracała `true` tylko gdy
   NA STOLE jest co najmniej jeden stwór-przyjaciel (nie tylko sprawdzanie
   `notSelf`/podtypu). Dla `spec.type === 'creature'` lub `'creature_you_control'`
   sprawdź `view.zones.battlefield.some(o => o.controllerId === view.playerId
   && o.kind === 'creature' && !subtypeFilter)`.
2. **Dodaj negatywną karę w cast_permanent** dla ETB z `add_counter`, gdy
   `etbFriendlyCounterTargetAvailable(view, req) === false` (podobnie do
   warpFutileEtbPenalty, ale o mniejszej wartości bo rzut zostawia ciało
   na stole). Stosujemy nowe pokrętło `castFutileEtbPenalty`, domyślnie 40
   (×0 anchor zachowany, kształt lustrzany do warp).

Waga = 40 wystarczy, żeby w sytuacjach z pustym stołem zepchnąć ocenę
granych kart „prawie na równi z passem", ale wciąż zostaje ciało (3/4 = 80 − 7 mana
= 73 + etb0 - 40 = 33 > 0), więc rzut nie jest wykluczony.

## Etapy

- [x] Etap 0 — sonda (scenariusze A/B/C/D) potwierdza asymetrię
- [x] Etap 1 — fix `etbFriendlyCounterTargetAvailable` (generyczny) — w PR #153; SKORYGOWANY w audycie PR #153 (znalezisko F1, PR #154 `6fa26e4`): wchodzący stwór liczy się jako gospodarz własnego ETB
- [ ] Etap 2 — dodanie kary `castFutileEtbPenalty` do `cast_permanent` — świadomie NIEzrealizowany (ADR 0022 §4; po korekcie F1 nieaktualny w tej formie — patrz „Wykonanie")
- [x] Etap 3 — piny w `test/pmssb47-cast-etb-counter-available.test.js` (E1–E4 po korekcie F1, PR #154)
- [x] Etap 4 — mutacje (usuń poprawkę → piny RED): m1 w PR #154 (E1 + kotwica A4 RED)
- [x] Etap 5 — bramki: fast, build, audit, scoring-snapshot
- [x] Etap 6 — docs (PMSSB §47, HISTORY, handoff) — domknięte w PR #154

## Piny

- E1: przy 0 własnych stworach karta z ETB `add_counter` wymagającym własnego
  stwora (Weftblade Enhancer z requiresTarget.type === 'creature') dostaje
  w etbEnterBonusValue 0, a nie +6.
- E2: `etbFriendlyCounterTargetAvailable(view, {type: 'creature'})` === false
  dla pustego stołu własnego.
- E3: przy 1 własnym stworze 2/2 premia ETB nadal jest naliczana (regresja).

## Wykonanie (2026-10-03j)

- **Etap 1 wykonany w PR #153, ale premisa była błędna.** Audyt PR #153
  (`docs/audits/AUDYT_PR153_2026-10-03.md`, F1) wykazał sondą na żywym
  silniku, że wchodzący stwór JEST legalnym celem własnego triggera ETB bez
  `notSelf` (CR 603.6d; silnik oferuje `resolve_trigger_target` z
  `targetIds: ['permanent-1']`), więc wymaganie stwora JUŻ na polu bitwy
  zamieniło zawyżkę w zaniżkę dla 3 kart (Weftblade Enhancer, Cloudbound
  Moogle, Simian Simulacrum). Realna zawyżka dotyczyła LĄDU (Idyllic Grange —
  wchodzący nie jest stworzeniem) i ta część naprawy jest słuszna.
- **Naprawa finalna (`6fa26e4`, PR #154):** bramka przyjmuje `enteringDef`
  (kartę rzucaną) i liczy ją jako cel, gdy jest stworzeniem spełniającym
  filtr spec-a i spec nie ma `notSelf`; `notSelf` (Jade Bearer) nadal wymaga
  INNEGO Merfolka. Kotwica A4 w `test/audyt-pmssb35-odroczenie.test.js`
  wraca 65.703 → 71.103.
- **Piny po korekcie:** E1 (self-host — brak dziury ~6 pkt przy pustym stole),
  E2 (rzut wybierany), E3 (score skończony), E4 (kontrola `notSelf`: bez
  Merfolka 0 premii, z Merfolkiem +6; drugi Merfolk nic nie dodaje).
- **Mutacja m1** (wyłączenie gałęzi self) → A4 + E1 RED. Bramki: `npm test`
  7501/7501 EXIT 0, build 70 modułów, bot-scoring-snapshot 4/4 bez dryfu.
- **Etap 2 odpuszczony świadomie** — rzut z ETB bez celu (LĄD/artefakt z
  „target creature you control" przy pustym stole) nie ma dziś karty
  demonstrującej lukę w katalogu; wraca do kolejki razem z taką kartą
  (ADR 0022 §4).
