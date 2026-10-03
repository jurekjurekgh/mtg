# PLAN 2026-10-03n — PMSSB-51: ETB lądu (z celem) bez legalnego celu osłabia land drop; warunek „enters untapped” rozstrzygany jak w silniku

Kolejka 4 (etap 2 planu `PLAN_2026-10-03h-pmssb47-cast-etb-target-available.md`,
świadomie odroczony w ADR 0022 §4, bo wtedy nie było karty demonstrującej).
Granica (1) §PMSSB-41: „wycena kolejności, gdy ETB ma wymóg celu”. Karta
demonstrująca ZNALEZIONA w tej sesji: **Idyllic Grange** (ELD, Land — Plains).

## Problem (zmierzony sondą, nie przeczuty)

Sonda `tools/probe-pmssb51-etb-ladu.mjs` (G1–G5; usunięta z drzewa przed
bramkami — lint prozy, konwencja z poprzednich rund), p1 w Głównej 1:

| scena | stół / ręka | `play_land(Grange)` | rzut gospodarza |
|---|---|---|---|
| G1 | 4 Plainsy, PUSTY stół, ręka Grange + stwór 2/1 | **82** (ląd wybrany) | brak oferty (koszt kolorowy W/B/U niepłacalny z mono-W) |
| G2 | 4 Plainsy, stwór NA STOLE | 82 | brak oferty |
| G3 | 4 Plainsy, pusty stół, ręka TYLKO Grange | 82 | — |
| G4 | 4 Plainsy, pusty stół, Grange + `porcelain-legionnaire` (3/1 za 3) | **82** | `cast_permanent` **63,9027** |
| G5 | 2 Plainsy (warunek „3+ inne Plains” NIESPEŁNIONY), ręka tylko Grange | 82 | — |

Dwie wady modelu:

1. **Kolejność (luka etapu 2):** `case 'play_land'` (L7146 `90 +
   landPlayDelta`) nie wołał ŻADNEJ wyceny ETB, więc G4 dawał ląd 82 >
   rzut 63,9 — bot stawiał LĄD PIERWSZY, a trigger „+1/+1 counter on target
   creature you control” przepadał (przy pustym stole nie ma legalnego celu).
   Ten sam trigger przy rzucie stwora jest już wyceniany (`etbEnterBonusValue`,
   PMSSB-47), więc asymetria „ląd nie ma ETB” fałszowała kolejność o ~18 pkt.
2. **Warunek wejścia (fałszywe −8):** `landAnaliza` czytała GOŁĄ flagę
   `entersTapped: Boolean(def?.entersTapped)` i ignorowała
   `entersTappedCondition` — ląd wchodzący ODKRĘCONY (warunek spełniony)
   płacił −8 za tapnięcie. W G2 widać to wprost: 82 = 90 − 8 mimo 4 Plainsów,
   choć silnik (`resources.playLand`, L2367–2375) rozstrzyga warunek
   i wstawia ląd odkręcony. Karta z warunkiem `controls_land_subtype_any`
   (`kishla-village`, warunek spełniony w talii `tarkir-bg`) płaciła to −8
   w golden-masterze — patrz „Dowód dryfu”.

Uwaga na fałszywy trop: `lodestone-needle` (LCI) NIE jest kartą demonstrującą
— jego spec to `artifact_or_creature` i wycena rzutu idzie ścieżką
`etbEnemyHasTarget` (cel wroga), a nie „mój stwór”.

## Zakres (jedno źródło reguły — L41; generycznie, ADR 0002/0017)

- **`src/controllers/heuristic-params.js`:** `castFutileEtbPenalty = 40`
  (obok `warpFutileEtbPenalty = 90`). Kara jest MNIEJSZA niż przy warp-ie, bo
  ląd ZOSTAJE na stole (nie jest stratą karty); jej rolą jest kolejność:
  `90 − 40 = 50 > pass 0`, więc land drop nadal jest opłacalny, ale przestaje
  wygrywać z rzutem gospodarza. `×0` = dokładnie stan sprzed PMSSB-51 (M429).
- **`src/controllers/heuristic-bot.js`:**
  - `entersTappedOfLand(def, mojeLandy, view)` — JEDNO miejsce rozstrzygania
    warunków wejścia w wycenie (lustro z odwołaniem do `resources.playLand`,
    jak `attackerCanBeBlocked` ↔ `combat.js`): `player_life_at_most`,
    `islands_you_control_at_least` (domyślnie 3), `controls_land_subtype_any`
    (domyślnie 1), `minOtherPlains`; wejście bez warunku = tapnięty
    (CR 614.1c). Wchodzący ląd nie jest jeszcze na polu bitwy, więc „other X”
    liczymy po istniejących moich landach — tak samo jak silnik.
  - `futileFriendlyCounterEtbPenalty(view, def, { entersTapped })` — dla
    triggera `enter_battlefield` z `requiresTarget` wg `isFriendlyCounterSpec`
    („moje stworzenie”) i efektem `add_counter`, gdy
    `etbFriendlyCounterTargetAvailable` = false, zwraca `castFutileEtbPenalty`.
    Dla STWORÓW nie zachodzi — wchodzący jest legalnym celem własnego triggera
    (CR 603.6d; korekta F1 sesji 03h) — dla lądu/artefaktu zachodzi.
    Bramka `condition.enteredUntapped` przy wejściu TAPNIĘTYM pomija trigger
    (wtedy kary nie ma).
  - `case 'play_land'` woła karę PO `landPlayDelta` — gdyby siedziała
    W środku, klamra `Math.max(-14, Math.min(25, delta))` zjadłaby ją
    (mutacja m5).
- **`test/pmssb51-etb-ladu-futile.test.js`** — piny E1–E6 (sześć scen = dwie
  wady + pokrętło + generyczność).

## Kryteria ukończenia

1. E1: pusty stół + gospodarz w ręce → **rzut wygrywa kolejność** z lądem
   (ląd 50, rzut > 50).
2. E2 (anty-over-fix): sam ląd w ręce → `play_land` nadal wybierany (50 > 0).
3. E3: stwór na stole (etap triggera ma cel) + warunek spełniony → ląd = 90
   (bez −8 i bez kary).
4. E4: warunek NIEspełniony (2 Plainsy) → ląd wchodzi tapnięty → trigger nie
   odpala → 82 (−8 zostaje, kary nie ma).
5. E5 (M429): `castFutileEtbPenalty: 0` → zachowanie sprzed PMSSB-51.
6. E6 (generycznie, ADR 0002/L41): zwykły `basic-plains` bez triggera → 90,
   bez żadnej kary.
7. Mutacje m1–m5 wywracają przypisane piny (RED→GREEN po przywróceniu).
8. Golden-master: świadoma regeneracja fixture z jawnym pomiarem PRZED/PO.

## Dowód dryfu golden-mastera (świadomy, 1 decyzja z 6 partii)

`node tools/bot-scoring-snapshot.mjs --dump` PRZED (mutacja m2 = warunek
ignorowany, zachowanie sprzed) i PO (kod bieżący), wszystkie 6 partii:

```text
tarkir-bg|warhammer-ubr@1001: decyzji 217 vs 217, scoreSum 2763,6261 vs 2755,6261
  #179 PRZED: play_land(drawn-56:kishla-village) = 84  ->  PO: = 92
łączna liczba różniących się decyzji: 1   (pozostałe 5 partii: 0 różnic)
```

Interpretacja: Kishla Village („enters tapped unless you control an Island or
a Swamp”) z warunkiem SPEŁNIONYM wchodzi odkręcony — bot przestaje płacić
fałszywe −8 (84 → 92). Kara ETB nie odpaliła w benchmarku ani raz (brak lądu
z ETB-celmem w taliach wzorcowych), więc cały dryf to JEDNA decyzja: „+8 na
weście, który wchodzi odkręcony, a nie tapnięty”. Decyzje 217 → 217 (żadna
nie zniknęła). Fixture zregenerowany świadomie (precedens PMSSB-32/50):
`fff9c22c…` → `16a139c2efd5229d…`, 3671 B.

## Wykonanie (2026-10-03n)

**Zmiana:** `heuristic-params.js` (+12), `heuristic-bot.js` (+83/−13),
`test/pmssb51-etb-ladu-futile.test.js` (nowy, 6 pinów), fixture golden-mastera.

**Piny E1–E6:** 6/6 GREEN; dodatkowo regresja skoncentrowana 269/269
(19 plików: wybór landu, `heuristic-bot`, M168/M308, batch25/49/53,
real-cards 14/15, PR134-kopia-wchodzi-odkręta, mtg-rules-fixes, pipsy,
PMSSB-35/41/49/50).

**Mutacje (każda RED → przywrócenie → GREEN):**

| mutacja | co psuje | RED |
|---|---|---|
| m1 | kara w `play_land` wyłączona (`futile = 0`) | E1, E2 |
| m2 | warunek wejścia ignorowany (`entersTapped` = goła flaga) | E1, E2, E3, E5 |
| m3 | brak bramki „trigger odpala” (kara także przy wejściu tapniętym) | E4 |
| m4 | dostępność celu zawsze prawdziwa | E1, E2 |
| m5 | kara W klamrze `landPlayDelta` (±14/25) | E1, E2 |

m5 dowodzi, że lokalizacja kary (po klamrze) jest istotna, nie kosmetyczna.

**Pomiary PO (sonda usunięta po pomiarach, wyniki w tej tabeli):**

| scena | `play_land(Grange)` | rzut | wybór bota |
|---|---|---|---|
| G1 (pusty stół, Grange + stwór 2/1 za 2) | 50 | brak oferty (koszt kolorowy niepłacalny z mono-W) | `play_land` |
| G2 (stwór na stole) | 90 | brak oferty | `play_land` |
| G3 (pusty stół, sam Grange) | 50 | — | `play_land` |
| G4 (pusty stół, Grange + 3/1 za 3) | 50 | 63,9027 | **`cast_permanent`** (kolejność naprawiona) |
| G5 (2 Plainsy, warunek niespełniony) | 82 | — | `play_land` |

**Bramki:** `npm test` **7537/7537** EXIT 0 (117,8 s) · build **70 modułów /
4814,2 kB** · `bot-scoring-snapshot` **4/4** po regeneracji ·
`event-contract-audit` **0 naruszeń**.

**Granice świadome:** proxy dostępności celu czyta WIDOK (bot nie zna
przyszłości) — jeśli cel dojdzie dopiero po rzucie w tej samej turze, kara
zostanie naliczona mimo realnej wypłaty (bezpieczny kierunek: bot wystawia
najpierw gospodarza); model nie wycenia wartości samego licznika dla lądu
(kara jest stała, nie zależna od jakości gospodarza) — dokładniejsza wycena
należy do `etbEnterBonusValue`, gdyby land-ETB miały w katalogu więcej kart.

**Status:** zamknięty (kod `bd96e07`, docs w tym commicie).
