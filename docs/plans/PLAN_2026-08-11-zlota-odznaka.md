# Plan 2026-08-11 — Złota odznaka: żywy tester stołu (M73d+Gold)

## Cel
Znaleźć 10+ błędów UX żywym testerem stołu (wzorzec M73c/M73d), różne
talie/seedy, w tym azorius/black (długie gry), czarodzieje walki, face-down,
tokeny, lochy/inicjatywa.

## Znalezione i naprawione

### Bug 1: `object_attached` bez `hostCardId` (session.js)
- **Objaw:** „Hunter's Blowgun zostaje załączony do ? (bestow)" — host aury/equipment
  jako `?` w logu, mimo istnienia `hostCardId` w evencie engine.
- **Root cause:** `describeGameEvent` w session.js (linia 228) wołało
  `nameOfObject(hostId)` zamiast `hostCardId ? nameOf(hostCardId) : nameOfObject(hostId)`.
  `nameOfObject` zwraca `?`, gdy ID obiektu zmieniło się przy re-equip/re-attach.
- **Fix:** użycie `hostCardId` z fallbackiem na `nameOfObject(hostId)`.
- **Test:** regresja + wzorzec M66/M71 (LKI cardIds).

### Bug 2: Podwójny event `object_attached` przy equip ze stosu (spells.js)
- **Objaw:** Hunter's Blowgun jako equipment dawał dwa eventy `object_attached`:
  pierwszy z `emitAttached` (via:'equip', hostCardId) — poprawny; drugi z ręcznego
  `state.events.push` (bez via, bez hostCardId) — fałszywy „bestow".
- **Root cause:** `resolveActivatedAbilityEntry` w spells.js po `attachEquipmentToCreature`
  (które samo emituje event) pushowało drugi, niekompletny event.
- **Fix:** usunięcie duplikatu — `attachEquipmentToCreature` już emituje poprawny event.
- **Test:** tester stołu — 0× „załączony do ? (bestow)" na equipment.

## Stan
- npm test: 1354/1354
- build: 50 modułów / 1471.2 kB
- Transkrypty: 10 partii (green/red, tokens/wiedzmin, azorius/black, black/green,
  innistrad/graveyard, red/azorius, spellslinger/tokens, green/azorius,
  azorius/tokens, wiedzmin/spellslinger, red/black)

## Kolejne kroki
- Dodanie testów regresyjnych dla obu bugów
- Dalszy audyt (więcej partii, inne seedy)
- Commit i push
