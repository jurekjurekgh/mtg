# PLAN 2026-10-20k — PMSSB-75: controlsType (Heron-Blessed Geist)

Status: ZAMKNIĘTE BEZ ZMIANY KODU (2026-10-20). Rejestr: `docs/PMSSB.md` §PMSSB-75. Spisany po pomiarze (zasada z PLAN_2026-10-20h).

## Pomiar
`.arena/probe-controls.mjs`: bez enchantmentu brak oferty; z enchantmentem wycena 24 (pusto), 18 (dwóch wrogów), 18 (dwóch wrogów, moje życie 5).

## Audyt
- L41: jedna bramka w `abilities.js` (`condition.controlsType`), oferta i walidacja wspólne. Zgodne.
- Koszt: bez zmiany.
- Anty-over-fix: bramka nie ma defektu — brak zmiany.
- Znaleziona luka POZA zakresem: wycena tokenów (`create_token`) nie reaguje na presję życia. Wspólna miara — osobna pętla.

## Test
`test/audyt-pmssb75-controls-type.test.js`: 3 testy; mutacja bramki łapie test 1.
