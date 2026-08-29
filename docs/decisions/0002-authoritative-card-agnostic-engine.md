# ADR 0002: Autorytatywny, niezależny od konkretnych kart engine

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Dzisiejszy Wirtualny Stół przechowuje i prezentuje pozycje kart, ale człowiek
ręcznie rozstrzyga zasady i wykonuje ruchy obu stron. Aby automatyzować
rozgrywkę i bezpiecznie podłączać boty, jeden komponent musi odpowiadać za stan
i legalność. Karty dochodzą stopniowo — wpisywanie ich wyjątków wprost do jądra
stworzyłoby trudny do utrzymania system warunków.

## Decyzja

- Powstaje headless engine: JEDYNY autorytet stanu i zasad. UI i kontrolery
  przekazują intencje, engine je waliduje i rozpatruje.
- Core zna ogólne pojęcia i procedury MtG, ale nie rozpoznaje zachowania po
  nazwie ani identyfikatorze karty. Karty korzystają z publicznych,
  kontrolowanych mechanik i rozszerzeń poza core.

```text
intencja → walidacja engine → wybory (jeśli potrzebne) → zmiana stanu → widok/eventy
```

## Konsekwencje

### Pozytywne

- Jedno źródło prawdy dla UI, testów i botów.
- Nielegalny ruch kontrolera nie narusza stanu.
- Reguły testowalne bez przeglądarki; mechaniki kart wielokrotnego użytku.
- Nowe interfejsy i boty nie duplikują logiki zasad.

### Koszty i ryzyka

- Obecny drag-and-drop trzeba przekształcić z mutacji w intencję.
- Engine wymaga jawnego modelu przerwanych wyborów, priorytetu i stosu.
- Trzeba pilnować granicy między regułą ogólną a specjalnym zachowaniem karty.
- Integracja z istniejącym UI wymaga adaptera.

## Rozważone alternatywy

- Reguły w event handlerach UI — sprzężenie z DOM-em, trudne testowanie.
- Agent AI jako sędzia — halucynacje, niedeterminizm, brak gwarancji legalności.
- Skrypty kart mutujące dowolny stan — rozszerzenia muszą używać
  kontrolowanego API.

## Powiązania

- [Architektura](../ARCHITECTURE.md)
- [ADR 0001](0001-incremental-card-support.md)
