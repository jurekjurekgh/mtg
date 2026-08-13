# Plan: polowanie na błędy vs CR (brązowa odznaka wyłapywacza)

Sesja `arena/019ff818-mtg`. Zlecenie właściciela: przejrzeć istniejące karty
i mechaniki, znaleźć i naprawić **5 błędów/uproszczeń vs zasady MtG** (CR).
Metoda: porównanie Oracle z implementacją; każdy kandydat jako probe (node),
potem test RED → fix → GREEN.

## Znalezione błędy (5)

### BUG 1 — `creature` trigger-target wyklucza źródło (CR 115.1 / „target creature")
Filtern typów `creature` w `triggers.js` odrzuca `object.id === sourceObject.id`.
Karty z Oracle „target creature" (BEZ „other") MUSZĄ móc celować w źródło:
- cloudbound-moogle: „put a +1/+1 counter on target creature" — przy byciu
  jedynym stworem ETB NIE odpala się wcale;
- forge-devil, reclusive-artificer, goblin-battle-jester, battle-rattle-shaman,
  silumgar-butcher, angelic-benediction.
Wyjątek: Faceless Butcher („another target creature") — źródło wykluczone.

### BUG 2 — Wavecrash Triton: lock_untap trwały zamiast „next untap step" (CR 701.30e)
Wavecrash Triton (heroic) używa `lock_untap` — blokada jest TRWAŁA, dopóki
źródło na bitwisku (jak Entrancing Lyre). Oracle: „That creature doesn't
untap during its controller's NEXT untap step" — jednorazowa, niezależnie od
źródła. Wymaga osobnego efektu.

### BUG 3 — Amass z wieloma armiami bez wyboru (CR 701.43)
„Amass N — choose an Army you control or create one" — przy 2+ armiach gracz
wybiera. Engine bierze pierwszą (`find`) bez decyzji. Dunland Crebain.

### BUG 4 — Caravan Vigil (Morbid) wymusza bitwisko bez opcji „may" (CR)
Oracle: „You MAY put that card onto the battlefield instead of into your hand
if a creature died this turn." Engine ustawia destination='battlefield'
bezwzględnie przy `creatureDiedThisTurn` — brak wyboru ręka/bitwisko.

### BUG 5 — Goad nie uniemożliwia blokowania (CR 701.38)
„Goaded creatures can't block." `canBlock`/`isLegalBlocker` nie sprawdzają
`goaded` — goaded stwór może blokować.

## Kolejność commitów
1. plan (docs/plans).
2. testy RED (`test/bug-hunt-2026-08-13.test.js`).
3. fix BUG 1 (triggers.js `creature` + Faceless Butcher notSelf).
4. fix BUG 2 (effects.js nowy efekt + Wavecrash).
5. fix BUG 5 (combat.js goad can't block).
6. fix BUG 4 (Caravan Vigil destination choice).
7. fix BUG 3 (amass choice).
8. docs (PROJECT_STATE / handoff).

## Weryfikacja
- `npm test` zielone (1421 → 1426).
- `npm run build` 50 modułów.
- Bot bez zmian → B0 niewymagany.

## Ryzyka
- `edit_file` psuje PL → python3.
- Po commicie `git push` (sandbox cofa HEAD).
- Amass wymaga nowej komendy; jeśli zbyt złożone — pozostaje kandydatem.
