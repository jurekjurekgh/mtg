# Plan sesji 2026-10-03d — PMSSB-43: dynamiczne X i pompy w payoffach triggerów rzutu

**Tryb:** ADR 0021 §4 (pętla jakości, kontynuacja z HANDOFF_2026-10-03).
**Wejście:** pozycja 1 kolejki PMSSB-42: „dynamiczne X i `buff_attacking_creatures`" (wskazówka
z komentarza w `heuristic-bot.js:5945`: „Dynamiczne X (np. `source_power`) i efekty skierowane
(`targetIndex`) są poza modelem (0), tak jak dotąd."). Po wciągnięciu PR #152 (landwalk),
kod produkcyjny ma zielone bramki (7479/7479, 70 modułów/4792,5 kB) i jedna jawnie
oznaczona luka w komentarzu.

## Diagnoza (sondą, nie domyślnie)

- `temporaryPumpPayoff(view, host, leg)` (L5945) jest wywoływane TYLKO z payoffu triggerów
  rzutu/ETB (L6142), a w nim wcześnie `return 0` gdy: (a) `leg.targetIndex != null`
  (pump skierowany) albo (b) `leg.type === 'buff_attacking_creatures'`. Pozostała część
  zakłada, że `power` i `toughness` są skończonymi liczbami — przy deskryptorze `'X'`
  lub `'card_types_in_all_graveyards'` lub `'source_power'` Number.isFinite odrzuca nogę,
  więc dostaje 0 tak samo jak `return 0`.
- `pumpDelta(view, effect)` rozpoznaje `pump_by_creature_count`, `sacrifice_food_choice`,
  `pump_by_gates`, a dla reszty bierze `effect.power ?? 0` jako LICZBĘ — nie rozwiązuje
  deskryptorów łańcuchowych (`'card_types_in_all_graveyards'`, `'source_power'`, `'oil_counters'`).
  Deskryptory statycznych CDA (pumpy „ten stwór dostaje +X/+0 za …") są rozwiązywane w
  `effectivePower/Toughness` i PlayerView niesie już wynikową moc (dobrze), ale pomp
  TRIGGEROWANYCH (Altars of the Goyf: `buff_creature_until_end_of_turn` z power
  `'card_types_in_all_graveyards'`) payoff nie rozwiąże.
- `PAYOFF_TEMP_PUMP_EFFECTS` (L5995) zawiera tylko `'pump'` i `'buff_creature_until_end_of_turn'`
  — brakuje `'buff_attacking_creatures'` i `'buff_land_creatures'` (ten ostatni dotyczy
  Jyoti, Moag Ancient, ale Jyoti nie jest w żadnej talii ani w formacie command zone
  i jest w srodziemie, które nie jest BENCH_DECK — bez kodu na zapas).
- `hostEvadesBlockers` (rozwiązane w PR #152) nie obejmuje landwalkowych gospodarzy
  z `'card_types_in_all_graveyards'`, bo to nie ma nic wspólnego z samą luką payoffu
  (pump DO KOŃCA TURY z dynamicznego źródła ma być liczony poprawnie niezależnie od ewazji).
- W katalogu wspieranych kart realnie występuje JEDNA karta z dynamicznym X w tym payoffie:
  **Altar of the Goyf** (MH2, kindred Artifact): trigger `attacks_alone` →
  `buff_creature_until_end_of_turn {power: 'card_types_in_all_graveyards', toughness: '…'}`.
  Altar NIE jest w żadnej talii (grep po `decks/` = 0 trafień). Druga to Jyoti
  (buff_land_creatures, format command zone poza engine, brak w talii). Żadna karta nie
  używa `source_power` w tym payoffie. To znaczy że luka nie jest objawiona przez sygnał
  właściciela — ale jest jawnie opisana komentarzem i dotyczy generycznego kształtu (L41).
- Zaliczenie `buff_attacking_creatures` do payoffu NIE wymaga karty do testu — sam trigger
  (Thunderstaff) jest aktywacją, a nie triggerem rzutu, więc payoff L6142 go nie dotyczy.

## Decyzja (po sondzie)

Naprawiam **generyczne rozwiązanie deskryptora dynamicznego** w `pumpDelta`
(ADR 0002 — po deskryptorze, nie po nazwie karty) i usuwam wczesny `return 0` z
`temporaryPumpPayoff` dla przypadków, które da się rozwiązać:

1. `pumpDelta` dostaje opcjonalny trzeci parametr `source` (host) i rozwiązuje:
   - `effect.power === 'card_types_in_all_graveyards'` → liczba unikalnych typów
     kart we WSZYSTKICH grobach z widoku (tak samo jak silnik: karty nie-tokenowe,
     liczone po `types` ∩ CARD_TYPES). Kryterium: `view.zones.graveyard` już
     wystawia oba groby (używane w wielu miejscach bota), a typy są w `o.types`.
   - `effect.power === 'source_power'` → `source.power` (effectivePower bota to
     `source.power` z widoku — po statycznych CDA; widok nosi wynikową wartość).
   - `effect.power === 'oil_counters'` → `source.counters?.oil ?? 0` (gdyby ktoś
     dodał trigger dający pump za oil — profilaktycznie; bez karty testującej,
     ale kształt generyczny).
2. `temporaryPumpPayoff`: usuwa `return 0` dla `buff_attacking_creatures` tylko gdy
   istnieje atakujący odbiorca z mojego pola — wpp. nadal 0. Wariant z `targetIndex`
   nadal 0 (skierowany pump na innego stwora niż host z okazji rzutu — nie ma
   wspieranej karty tego kształtu, bez kodu na zapas).
3. `PAYOFF_TEMP_PUMP_EFFECTS` rozszerzone o `'buff_attacking_creatures'` (kształt
   istnieje w silniku; nie ma karty z takim triggerem rzutu, ale sam wpis nic nie
   kosztuje, a zmniejsza ryzyko przyszłych kart tego kształtu). NIE dodaję
   `buff_land_creatures` — nie ma karty w formacie.
4. Dodam pomiarową sondę dla Altar-scenariusza (atak sam ze stworem 2/2 przy 4
   typach w grobach → pump +4/+4, wartość payoffu > 0; przy 0 typach → 0).
5. Test pinujący generyczne rozwiązanie (syntetyczny widok) oraz mutację: bez
   obsługi `'card_types_in_all_graveyards'` test czerwienieje (L13).
6. Bramki: fast, all na koniec, build, event-contract-audit.

## Etapy

- [ ] Etap 0 — sonda Altar-scenariusz PRZED naprawą (baseline)
- [ ] Etap 1 — `pumpDelta` z opcjonalnym `source` + resolverami deskryptorów
- [ ] Etap 2 — `temporaryPumpPayoff`: warunki wczesnego return 0 rozluźnione, `PAYOFF_TEMP_PUMP_EFFECTS` + `buff_attacking_creatures`
- [ ] Etap 3 — piny + mutacje
- [ ] Etap 4 — bramki (fast `npm test`, build, event-contract-audit)
- [ ] Etap 5 — docs (PMSSB §43, HISTORY, handoff zaktualizowany)

## Granice świadome

- Żadnej obsługi `greatest_power_you_control` (tylko przy token-creature, nie jest
  pumpem do końca tury i nie wchodzi do tego payoffu).
- Żadnej obsługi `greatest_mana_among_other_artifacts` (pump statyczny Emissary
  Escort, PlayerView już nosi wynikową moc w `power`).
- Bez pełnego B0 (ADR 0018) — quick benchmark na koniec.
- Żadnego kodu na zapas dla kart nieistniejących w katalogu.
