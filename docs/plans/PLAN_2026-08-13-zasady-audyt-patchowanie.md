# PLAN 2026-08-13: Zasady projektu — audyt poprzedniego PR i chirurgiczne patchowanie

## Cel

Dopisać do Zasad Projektu dwie trwałe reguły procesowe:

- **A.** Każda nowa sesja obowiązkowo zaczyna się od szczegółowego audytu
  poprzedniego PR (poprawność zmian w engine, prawidłowe zakodowanie kart
  w batchu + audyt mechanik), bez pełnego BO.
- **B.** Patchowanie chirurgiczne (minimalna ilość kodu); przy wymianie całych
  funkcji/plików obowiązek dwukrotnego sprawdzenia, czy nie zgubiono istotnych
  elementów (zmienne, pola, odwołania, warunki brzegowe).

## Kryteria ukończenia

- [x] Reguły A i B w `AGENTS.md` (sekcja startu zadania i „Oczekiwania wobec zmian").
- [x] Nowy ADR 0016 jako trwały rejestr decyzji.
- [x] Spis ADR w `docs/decisions/README.md` zaktualizowany (wiersz 0016).
- [x] `npm test` przechodzi (baseline 1458 pass / 0 fail — zmiana dokumentacyjna).
- [x] Commit na gałęzi `arena/019ff818-mtg` → PR #46.

## Ryzyka

- Miejsce zapisu (ADR vs AGENTS.md): wybrano AGENTS.md (operacyjne reguły dla
  każdego agenta) + ADR 0016 (trwały rejestr decyzji).
- Polskie znaki: edycje wykonywane przez `python3`, nie `edit_file`.
