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
- [ ] Etap 1 — fix `etbFriendlyCounterTargetAvailable` (generyczny)
- [ ] Etap 2 — dodanie kary `castFutileEtbPenalty` do `cast_permanent` (przyjazne liczniki bez celu)
- [ ] Etap 3 — piny w `test/pmssb47-cast-etb-counter-available.test.js`
- [ ] Etap 4 — mutacje (usuń poprawkę → piny RED)
- [ ] Etap 5 — bramki: fast, build, audit, scoring-snapshot
- [ ] Etap 6 — docs (PMSSB §47, HISTORY, handoff)

## Piny

- E1: przy 0 własnych stworach karta z ETB `add_counter` wymagającym własnego
  stwora (Weftblade Enhancer z requiresTarget.type === 'creature') dostaje
  w etbEnterBonusValue 0, a nie +6.
- E2: `etbFriendlyCounterTargetAvailable(view, {type: 'creature'})` === false
  dla pustego stołu własnego.
- E3: przy 1 własnym stworze 2/2 premia ETB nadal jest naliczana (regresja).
