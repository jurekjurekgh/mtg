# Handoff 2026-11-05 — zgłoszenie E: Inferno Titan, podział obrażeń

## Objaw i przyczyna

Modal ETB Inferno Titana pozwalał zaznaczyć tylko 0 albo 3 cele, a po
wybraniu trójki podział był wymuszony 1/1/1. Silnik i kreator podziału
były poprawne — w `openChoiceRequest` (src/table/main.js) kreator
ptaszkowy „do N celów” (`upToTargetsPlanOf`) przechwytywał komendy
`resolve_trigger_target` PRZED gałęzią `damage_division`, więc kreator
kwot nigdy się nie otwierał. Ptaszkowy dopasowuje zaznaczenie do
wyenumerowanych wariantów silnika (limit 32), które przy większej
liczbie kandydatów zawierają tylko trójki i wariant pusty; kwoty
z enumeracji kompozycji dla 3 celów mają jedną postać: 1/1/1.

## Naprawa (commit `d1f7d3d`)

- Gałąź `damage_division` w `openChoiceRequest` stoi przed kreatorami
  ptaszkowymi.
- `renderDamageDivisionWizard` ma opcję `allowZeroTargets` (tylko
  ścieżka triggera): potwierdzenie przy zeru celów = obrażenia
  przepadają. Rzut czaru dzielonego (Fireball) bez zmian.
- Bez zmian silnika, karty i bota.

## Dowody

- `test/zgloszenie-e-inferno-podzial.test.js` (E/1–E/4) 5/5, mutacja
  gałęzi złapana; pakiet pokrewny 52/52; `npm test` 10001/10001;
  build 77 modułów / 5714,6 kB; `npm run test:all` 10269/10269.
- Plan: `docs/plans/PLAN_2026-11-05-e-inferno-podzial.md`.

PR #179 czeka na decyzję właściciela o scaleniu (nie scalono).
