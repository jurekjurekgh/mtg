# ADR 0016: Audyt poprzedniego PR na starcie sesji i chirurgiczne patchowanie

- **Status:** Zaakceptowana
- **Data:** 2026-08-13
- **Decydenci:** właściciel projektu

## Kontekst

Projekt prowadzą sesje Agent Arena (ADR 0013): każda startuje z gałęzi `main` i
tekstu pierwszego promptu, bez dostępu do stanu lokalnego poprzedniej sesji.
Praca poprzednich sesji trafia do `main` przez scalenie PR (ADR 0007, 0013), a
pojedynczy PR może naraz zawierać zmiany engine, batch kart, talie i bota. Nowa
sesja musi więc zweryfikować poprzedni PR, zanim go rozbuduje — inaczej błędy
poprzedniej sesji propagują się dalej.

Ponadto agenci wielokrotnie przepisywali całe funkcje i pliki, ryzykując
zgubienie istotnych elementów (zmienne, odwołania do innych funkcji, warunki
brzegowe) i wprowadzając regresje.

## Decyzja

### A. Audyt poprzedniego PR na starcie sesji

Każda nowa sesja zaczyna się od szczegółowego audytu poprzedniego PR
(ostatniego zmergowanego lub aktualnie otwartego):

1. **poprawność zmian w engine** (reguły, stan, FoW, determinizm) — żadna zmiana
   nie jest pominięta ani nie regresuje istniejących zachowań;
2. **prawidłowe zakodowanie kart w batchu** — zgodność z Oracle text (Scryfall)
   i mechanikami, poprawne pola i `limitations`, działanie na prawdziwych
   scenariuszach;
3. **audyt mechanik** używanych przez dodane karty — implementacja generyczna,
   bez specjalnych przypadków po nazwie/ID karty (ADR 0002).

Audyt prowadzony jest **bez pełnego BO** (pełna macierz benchmarku może
przekroczyć limit czasu sesji); dopuszczalne potwierdzenie to `npm test` oraz
`node --test test/bot-benchmark.test.js`. Wnioski trafiają do
`docs/plans/PLAN_*.md` i `docs/PROJECT_HISTORY.md`.

### B. Chirurgiczne patchowanie

Zmiany kodu podmieniają **minimalną ilość kodu** (pojedyncze linie, bloki,
warunki), nie całe funkcje czy pliki. Jeżeli wymiana całej funkcji lub pliku
jest niezbędna, agent **dwukrotnie sprawdza**, czy nowa wersja nie zgubiła
istotnych elementów: zmiennych, pól, odwołań do innych funkcji, warunków
brzegowych. Zalecane jest przejrzenie `git diff` po zmianie i opisanie w
commicie, co zostało zachowane.

## Konsekwencje

### Pozytywne

- Nowa sesja zaczyna od zweryfikowanego stanu — błędy poprzedniego PR są łapane
  u root cause, zanim się rozbudują.
- Mniej regresji ze zgubienia elementów przy przepisywaniu kodu.
- Mniejsze diffy, łatwiejsze review i scalanie (ADR 0007).

### Koszty i ryzyka

- Audyt na starcie sesji dodaje pracę przed właściwym zadaniem — ograniczany
  przez wykonywanie go bez pełnego BO.
- Chirurgiczne poprawki mogą skłaniać do doraźnych łatek zamiast większych
  refaktorów — reguła dotyczy sposobu wprowadzania zmian, nie zastępuje decyzji
  o uzasadnionym refaktorze.

## Rozważone alternatywy

- **Reguły wyłącznie w `AGENTS.md`, bez ADR** — obowiązywałyby, ale bez
  trwałego rejestru decyzji odtwarzalnego z repozytorium.

## Powiązania

- ADR 0002 (engine niezależny od kart), ADR 0007 (chroniony `main` + PR),
  ADR 0013 (sesje Agent Arena i handoff), `AGENTS.md`.
