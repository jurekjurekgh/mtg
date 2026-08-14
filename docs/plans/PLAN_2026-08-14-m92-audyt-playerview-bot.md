# PLAN 2026-08-14 — M92: audyt „bot nie widzi stanu" (wzorzec z M91/A1)

**Gałąź:** `arena/01a000df-mtg` (PR #52, ta sama sesja).
**Baza:** M91 (`1c4d296`), `npm test` 1575/0, build 50 / 1633.6 kB.

## Dlaczego ten audyt

M91/A1 pokazał, że „głupi ruch bota" bywa objawem **braku danych w PlayerView**,
a nie słabej heurystyki. Kontroler z zasady dostaje widok, nie stan
(nienegocjowalna granica z AGENTS.md), więc pole nieobecne w widoku jest dla
bota **fizycznie niewidoczne**. Ten sam wzorzec wystąpił wcześniej w M84
(Station) i M82 (cele zdolności) — czyli to problem systemowy, nie incydent.

## Inwentaryzacja (stan → widok → bot)

Zestawienie pól `createGameState` z zawartością `playerView` i odczytami w
`heuristic-bot.js` (skrypt jednorazowy, wynik poniżej — pominięto `pending*`,
które mają własne widoki, oraz pola czysto techniczne):

| Pole stanu | W widoku | Czyta bot | Ocena |
|---|---|---|---|
| `preventCombatExceptEnchanted` | TAK | TAK | naprawione w M91 |
| `preventDamageThisTurn` | **NIE** | nie | **LUKA — potwierdzona repro** |
| `damageShields` | **NIE** | nie | **LUKA — potwierdzona repro** |
| `regenerationShields` | **NIE** | nie | **LUKA — usuwanie idzie w piach** |
| `cantBeRegeneratedThisTurn` | **NIE** | nie | luka wtórna do powyższej |
| `spellsCastThisTurn(ByPlayer)` | NIE | nie | wpływa na triggery, nie na wybór — poza zakresem |
| `creatureDiedThisTurn` (morbid) | NIE | nie | jw. |
| `dealtDamageToOpponentThisTurn` | NIE | nie | jw. |
| `cardsDrawnThisTurn` | NIE | nie | jw. |
| `delayedTriggers`, `linkedAnimations`, `untilEndOfTurnBuffs` | NIE | nie | wewnętrzna księgowość |
| `commands`, `events`, `objectSequence`, `mulliganCounts` | NIE | nie | techniczne, słusznie ukryte |

## Dowody (repro headless, przed naprawą)

1. **Zmarnowany removal.** Bot mając Fiery Fall („deals 5 damage to target
   creature") i cel chroniony przez Ethersworn Shieldmage
   (`preventDamageThisTurn: [{typesInclude:['Artifact'], isCreature:true}]`)
   **rzuca czar**: `damage_prevented` ×1, `damage = 0`, cel żyje, karta
   przepadła.
2. **Zmarnowany removal (tarcza).** To samo z `damageShields`
   (Withstand na stworze przeciwnika) — bot celuje w chroniony obiekt.
3. **Przegapiony darmowy atak.** Bot z artefaktowym stworem 2/2 przy aktywnej
   prewencji obrażeń dla artefaktowych stworów **nie atakuje** w 5/5, choć
   jego stwór w tej turze nie może zginąć w bloku (atak = 2 darmowe obrażenia).

Wszystkie trzy są zgodne z regułami MtG (prewencja jest informacją publiczną —
efekt rozstrzygnięty na stole widzą obaj gracze), więc ujawnienie tych pól
w widoku **nie narusza Fog of War**.

## Zakres naprawy

**W zakresie (mierzalny wpływ na decyzje):**
1. `playerView` niesie: `preventDamageThisTurn`, `damageShields`,
   `regenerationShields`, `cantBeRegeneratedThisTurn`.
2. Bot: kara za czar zadający obrażenia w cel z pełną prewencją/tarczą
   (marnowanie karty).
3. Bot: kara za `destroy_permanent` w cel z tarczą regeneracji (chyba że
   działa `cantBeRegeneratedThisTurn`).
4. Bot: atak stworem chronionym prewencją jest bezpieczny (nie ginie w bloku).

**Poza zakresem (świadomie):** liczniki turowe (`spellsCastThisTurn`,
`creatureDiedThisTurn`, `dealtDamageToOpponentThisTurn`, `cardsDrawnThisTurn`).
Wpływają na warunki triggerów rozstrzygane przez engine, a nie na wybór
komendy; dodawanie ich „na zapas" łamałoby zasadę z AGENTS.md. Zapisane
w handoffie jako kandydaci, gdy pojawi się karta, dla której bot ma je wyceniać.

## Kolejność prac

1. Plan (ten plik) — commit.
2. RED: testy widoku (4 pola) + testy zachowania bota (3 scenariusze z repro).
3. Fix 1: `playerView` (FoW: tylko informacje publiczne).
4. Fix 2–4: heurystyka (generycznie, bez nazw kart — ADR 0002).
5. `npm test`, `npm run build`, benchmark (bot zmieniany!), Żywy Tester.
6. Dokumentacja + dopisanie do PR #52.

## Definition of Done

- Każda luka: test RED→GREEN; brak specjalnych przypadków po nazwie karty.
- `npm test` ≥1575 + nowe, `npm run build` OK.
- Benchmark bez niedokończonych partii; progi `0.78 / 0.57` utrzymane
  (oczekiwany neutralny lub dodatni wpływ — bot przestaje marnować karty).
- Handoff zawiera listę pól świadomie NIEwystawionych i uzasadnienie.

## Podsumowanie wykonania

(uzupełniane na końcu)
