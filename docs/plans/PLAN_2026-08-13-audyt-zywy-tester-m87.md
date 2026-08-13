# Plan: audyt żywym testerem M87 (do skutku)

Data: 2026-08-13. Gałąź `arena/019ffc52-mtg` (PR #49). Nie merge.

## Cel

Partie na `dist/mtg-table.html` przez `tools/table-tester/run-game.mjs`.
Rola gracza. Szukanie unikalnych błędów UI/bota/etykiet/zasad na stole.
Co 10 napraw: testy + commit + push.

## Talie / seedy (inne niż M85/M86)

- azorius vs black seed 77
- green vs red seed 19
- wiedzmin vs azorius seed 101
- sojusznicy vs innistrad seed 44
- black vs tokens seed 66
- red vs graveyard seed 90

## Kryteria

- Brak twardych nazw kart w engine (ADR 0002).
- `npm test` zielone przed commitem.
- Nie liczyć ponownie M85/M86.

## Etapy

- [ ] Build + pierwsze partie
- [ ] 10 błędów + testy + commit
- [ ] kolejne partie aż sucho
