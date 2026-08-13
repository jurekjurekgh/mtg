# Plan: audyt żywym testerem M85 (2026-08-13)

## Cel
Partie na artefakcie (`tools/table-tester`) jak gracz: green vs red (seed 101),
azorius vs black (seed 77). 15+ usterek, naprawy bez wyjątków po nazwie karty.

## Naprawy
1. Negate / Stoic / Steel Sabotage — `kind === 'activated'` nie jest czarem (CR 701.5).
2. Etykieta szukania: `session.nameOfObject` (biblioteka ukryta w PlayerView).
3. SBA anihilacji +1/+1/−1/−1: `total: 0` + polski log.
4. Fertile Thicket: etykieta z nazwą landa / skip.
5. Tester: w modalu szukania nie klika „nie znajduj”, gdy jest kandydat.
6. Bot: Fireball we własnego gracza dostaje karę; preferuje przeciwnika.
7. Inspiring Bard: tryb + cel w `commandLabel`.
8. `destroy_permanent` w tekście reguł: „zniszcz cel”.
9. Altar of the Goyf: keywordi statyczne ze scope (np. „twoje stwory Lhurgoyf: Zadeptywanie”).

## Testy
`test/audit-m85-tester.test.js`
