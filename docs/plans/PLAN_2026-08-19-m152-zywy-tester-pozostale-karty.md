# PLAN sesji M152 — Żywy Tester, pozostałe karty ostatnich batchy

Gałąź: `arena/01a01a7b-mtg` (PR #65).

## Zlecenie właściciela
Przeprowadź kolejną sesję Żywym Testerem celując w karty z ostatnich batchy,
które w M151 nie zostały rozegrane. Weryfikuj poprawność w grze, kombinacje
efektów, efektywność bota. Jeśli z logu wynikną nowe klasy — dodaj detektory.

## Zakres
Karty niezagrane w M151: Static Net, Piercing Rays, Village Bell-Ringer,
Survivor of Korlis, Palace Familiar (azorius); Thornhide, Grizzled, Satyr
Wayfinder, Feral Invocation (green); Omenspeaker, Twiddle, Mysteries (spell);
Wretched Banquet, Mindstab (black).

## Metoda
Tymczasowe talie audytowe (docelowe karty + lądy) rozegrane Żywym Testerem,
potem usunięte. Weryfikacja w kodzie każdego znaleziska.

## Postęp
- [x] Rozegrano azorius/green/spell/black talie audytowe (wiele seedów).
- [x] Static Net, Piercing Rays, Village Bell-Ringer, Survivor, Palace,
      Omenspeaker, Twiddle, Wretched Banquet, Mindstab, Returned, Liliana,
      Bone Splinters — zweryfikowane jako poprawne w grze.
- [x] **Znalezisko 1:** Satyr Wayfinder „Weź ląd do ręki: ?" — naprawione
      (etykieta z pełnego stanu sesji dla odsłoniętej karty biblioteki).
- [x] **Znalezisko 2:** Tester stop na „Weź ląd / Nie bierz lądu" — naprawione.
- [x] Test regresyjny `satyr-wayfinder-label-m152`.
- [x] `npm test` zielony (2397/2397); build; push; CI; opis PR.
