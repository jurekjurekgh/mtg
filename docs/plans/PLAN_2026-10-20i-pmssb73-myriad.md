# PLAN 2026-10-20i — PMSSB-73: myriad (Gnoll War Band)

Status: ZAMKNIĘTE BEZ ZMIANY KODU (2026-10-20). Rejestr: `docs/PMSSB.md` §PMSSB-73.

## Pytanie
Czy myriad w bocie wymaga wyceny (pętla PMSSB)?

## Pomiar i wynik
- Atak Gnolla w 1v1: wycena 16 z myriad i 16 bez; pole 1 → 1 obiekt; stos pusty (`.arena/probe-myriad.mjs`).
- Źródło: warunek `anotherOpponentExists` = `players.length > 2` (`src/engine/triggers.js`). Format 1v1 (ADR 0022, `docs/PRODUCT.md`).

## Audyt (L41 / koszt / anty-over-fix)
- L41: bot nie ma wspólnej miary dla myriad i nie potrzebuje jej — efekt w 1v1 nie istnieje.
- Koszt: brak wymiaru.
- Anty-over-fix: brak defektu do naprawy; wprowadzenie wyceny byłoby wyceną efektu, którego nie ma.

## Wniosek
Pętla zamknięta dowodem (piny), bez zmiany kodu. Otwarte poza zakresem: efekt myriad w multiplayer (gdyby format się zmienił).
