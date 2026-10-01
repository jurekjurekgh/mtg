# Plan sesji 2026-09-29e — PMSSB-23: liczniki (`add_counter` i rodzeństwo)

## Zlecenie i stan początkowy

- Zlecenie właściciela (po zadaniu A — badge Bonds of Faith, commit
  `7fae454`): „Pętla Manualnego Strojenia Scoringu Bota" — wybrać JEDEN
  efekt/rodzinę/zdolność i przeprowadzić **audyt przyczynowo-skutkowy**
  scoringu: kiedy efekt jest taktycznie najsilniejszy, w jakich fazach
  i turach, na jaki cel, przy jakim stanie gry i zagrożeniach; potem tak
  ustawić scoring, by premiował momenty sensowne i karał bezsensowne.
  Wprost: **nie** tuning maszynowy na dużej próbie walk (ADR 0018) —
  przemyślany audyt i zmiany z niego wynikające. Właściciel zezwolił
  rozbudować silnik o dane, których brakuje do oceny taktycznej.
- Rozpoznanie rodziny (krok 2 procedury PMSSB): inwentarz typów efektów
  katalogu (`createCardRegistry().all()`, 179 typów) × rejestr
  `docs/PMSSB.md`. Największa rodzina **poza** rejestrem: `add_counter`
  — **33 karty / 34 wystąpienia**. Rodziny większe (`create_token` 41,
  `draw_cards` 40, `pump` 34) są DONE; `pump/grant` z rejestru to pump
  **do końca tury** (M96/M173/M179/M218, okna walki) — licznik jest zasobem
  **trwałym**, więc to inna decyzja taktyczna i inna wycena.
- Skład rodziny (pomiar): 25× `+1/+1`, 2× `stun`, 2× `charge`, 2× `oil`,
  1× `-1/-1`, 1× `level`, 1× `point`. Okna: **7 czarów** (sorcery:
  courage-in-crisis, knockout-maneuver, stall-out, malamet-battle-glyph,
  hunt-the-weak; instant: lifecrafters-gift, dragonscale-boon),
  7 zdolności aktywowanych, ~19 triggerów.
- Rodzeństwo (ten sam skutek — położenie licznika):
  `add_counter_to_creatures_you_control` (2 karty: rider lifecrafters-gift,
  trigger vaan-street-thief) — **zero gałęzi wyceny w bocie** (grep
  `src/controllers/` = 0 trafień).

## Zakres

Wycena położenia licznika w trzech ścieżkach decyzji bota:
`cast_spell`, `activate_ability`, tabela riderów ETB. Bez ruszania rodzin
POKRYTYCH (pump do końca tury, tap/untap, removal).

## Pomiar PRZED (sondy `/home/user/scratch/pmssb23-{liczniki-przed,r2,r3}.mjs`)

| # | Scenariusz | Wynik bota | Wniosek |
|---|---|---|---|
| S1 | Stall Out {2} (tap + 3 stun): wróg 3/3 vs własny 2/2 | 67 / 1 | kierunek OK |
| S2 | Stall Out: wróg 6/6 trample vs 1/1 | **40 / 40** | remis — cel arbitralny |
| R2 | Stall Out na JUŻ TAPNIĘTYM 6/6 vs tapniętym 1/1 | **38 / 38** | tap = no-op, czyli 3 stun wnoszą 0 |
| T1 | ten sam 6/6: Stall Out (tap+3 stun) vs Sleep of the Dead {1} (tap + lock 1 tura) | 40 vs 23 (na 1/1: 40 vs 13) | `dont_untap` wyceniony, stun nie |
| S3 | Courage in Crisis: własny 2/2 vs wrogi 2/2 | 70 / −92 | M155 + PMSSB-18 stoją |
| S5 | Dragonscale Boon: gospodarz 5/5 / 2/2 / 1/1 | 86 / 68 / 62 | waga ciała działa (2×(2P+T)) |
| T5 | Dragonscale Boon: 2/2 Flying / 2/2 Menace / 2/2 wanilia | **68 / 68 / 68** | remis — ewazja niewidoczna |
| S7 | Courage w main1 vs w main2 | **70 / 70** | Δ timing = 0 |
| T4 | Lifecrafter's Gift (instant) w blokach tury przeciwnika | 68 (= main1) | okno walki nie zmienia wyceny |
| T2 | Trigon {2},{T},charge: `-1/-1` na 1/1 / 3/3 / 6/6 trample | 34 / **16 / 16** | kill wyceniony, zagrożenie nie |
| T3 | Lifecrafter's Gift: 1 / 2 / 4 stwory z licznikiem (rider rozlania) | **74 / 74 / 74** | rider rozlania = 0 |
| R3 | Cenn's Tactician {W},{T}: cel 5/5 Soldier / 1/1 / sam (1/1) | 38 / 14 / 14 | `counterHostValue` działa w zdolności |
| R6 | Rustvine Cultivator {T}: oil (jest tapnięty las) | −6 → pass | M173/D stoi (konsument nic nie zyskuje) |
| S10 | Trigon {B}{B},{T}: charge counter | 2 | zasób bez presji — OK |

Fakt z widoku (sprawdzony): wpis `playerView` niesie P/T **z licznikami**
(2/2 z `+1/+1` → power 3, toughness 3), więc „+6" przy celu z licznikiem to
waga ciała gospodarza (2 × 3), a nie wartość ridera — rider rozlania jest
warty dokładnie **0**.

## Findingi

- **F1 (L41 + brak gałęzi)** — w `cast_spell` wyceniane są TYLKO liczniki
  przyjazne (`+1/+1`, `+1/+0`, `+0/+1`, `shield`); liczniki wrogie (`stun`,
  `-1/-1`) dają **0**, choć ta sama instrukcja w `activate_ability` dostaje
  `10 + 4·amount` (dobicie `30 + 2·moc`). Trzecia prawda o tym samym: silnik
  ma `HOSTILE_COUNTERS` (`effect-intent.js:44`), bot ma własny
  `DEBUFF_COUNTERS` w jednej gałęzi i listę `beneficial` w drugiej.
- **F2 (cel bez zagrożenia)** — wrogi licznik nie widzi, w co trafia:
  3 stun na 6/6 trample = 3 stun na 1/1 (40/40), `-1/-1` na 6/6 = na 3/3
  (16/16). Bot „zamyka" cel wybrany przez kolejność enumeracji.
- **F3 (rider rozlania = 0)** — `add_counter_to_creatures_you_control`
  (trwałe +1/+1 na KAŻDY mój stwór z licznikiem) nie ma gałęzi: 1, 2 i 4
  odbiorców dają tę samą ocenę.
- **F4 (ewazja gospodarza)** — licznik na stworze nieblokowalnym zamienia
  się w obrażenia, których przeciwnik nie zatrzyma; na wanilii można go
  zneutralizować wymianą. Dziś: 68/68/68.
- **F5 (timing = 0)** — `counterCombatBonus` (+12) zapala się tylko dla
  walki, która TRWA (`pumpImprovesOutcome` → `combatOutcome` = null poza
  walką), więc licznik rzucony w main1 na stwora, który za chwilę atakuje,
  jest warty tyle samo co rzucony w main2 — ten drugi musi jeszcze
  przetrwać turę przeciwnika, zanim cokolwiek zrobi.

## Fale

- **Fala A (L41)** — jeden helper `counterEffectValue(view, cel, licznik,
  amount, kontekst)` + jedna klasyfikacja liczników (przyjazny/wrogi/zasób)
  użyta w `cast_spell`, `activate_ability` i tabeli ETB. Kotwica M429:
  wartości wrogich liczników w czarze = dotychczasowe wartości ze zdolności
  (`10 + 4·amount`, dobiecie `30 + 2·moc`) — najsłabszy realny wariant bez
  zmian, nic nowego poza wyrównaniem ścieżek.
- **Fala B (cel i odbiorcy)** — `counterThreatWeight`/`counterThreatCap`
  (dopłata za zagrożenie celu wrogiego licznika, wzorzec PMSSB-21:
  `opponentTargetThreatWeight` z limitem) + `counterSpreadPerRecipient`
  (rider rozlania liczony od odbiorcy, nie od faktu).
- **Fala C (okno i zegar)** — `counterEvasionBonus` (gospodarz, którego
  przeciwnik nie zablokuje), `counterPrecombatBonus` (bramka M179/C:
  moja tura + `precombat_main` + gospodarz może atakować) i
  `counterLethalClockBonus` (moc gospodarza + amount ≥ życie przeciwnika —
  licznik, który domyka grę). Wszystkie jako DOPŁATY (anty-over-fix M429).

## Testy i bramy

- `test/audyt-pmssb23-liczniki.test.js` (wzorzec M429: decide/trace, piny
  PRZED→PO z tabeli wyżej, pokrętła ×0 przywracają dawną wartość,
  anty-over-fix: najsłabszy realny wariant = dawna liczba).
- Mutacja na każdą falę (czerwony test po odwróceniu reguły) + przywrócenie
  z kopii `cp` (L136).
- Bramy: `npm test`, `npm run build`, `npm run test:all` (jedno czyste
  uruchomienie na koniec, bez edycji w trakcie), `tools/bot-tie-audit.mjs`.
- Dokumentacja: raport §PMSSB-23 w `docs/PMSSB.md` + wpis w rejestrze
  (status DONE) + `docs/PROJECT_HISTORY.md`; bez wpisu do LESSONS, jeśli
  budżet lektury nadal zablokowany (precedens PR136/PMSSB-19).
