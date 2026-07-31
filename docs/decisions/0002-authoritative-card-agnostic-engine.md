# ADR 0002: Autorytatywny, niezależny od konkretnych kart engine

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Dzisiejszy Wirtualny Stół przechowuje i prezentuje pozycje kart, ale człowiek ręcznie rozstrzyga zasady i wykonuje ruchy obu stron. Aby automatyzować rozgrywkę i bezpiecznie podłączać boty, jeden komponent musi odpowiadać za stan i legalność.

Jednocześnie konkretne karty będą dochodzić stopniowo. Umieszczanie ich wyjątków bezpośrednio w jądrze szybko stworzyłoby trudny do utrzymania system warunków.

## Decyzja

Powstanie headless engine, który jest jedynym autorytetem stanu i zasad. UI oraz kontrolery przekazują intencje i wybory, a engine je waliduje i rozpatruje.

Core zna ogólne pojęcia i procedury MtG, ale nie rozpoznaje zachowania po nazwie ani identyfikatorze konkretnej karty. Karty korzystają z publicznych, kontrolowanych mechanik i rozszerzeń poza core.

```text
intencja → walidacja engine → wybory (jeśli potrzebne) → zmiana stanu → widok/eventy
```

## Konsekwencje

### Pozytywne

- Jedno źródło prawdy dla UI, testów i botów.
- Nielegalny ruch kontrolera nie narusza stanu.
- Reguły można testować bez przeglądarki.
- Nowe interfejsy i boty nie duplikują logiki zasad.
- Mechaniki kart mogą być ponownie używane.

### Koszty i ryzyka

- Obecny drag-and-drop trzeba przekształcić z mutacji w intencję.
- Engine wymaga jawnego modelu przerwanych wyborów, priorytetu i stosu.
- Należy pilnować granicy między regułą ogólną a specjalnym zachowaniem karty.
- Integracja z istniejącym UI wymaga adaptera.

## Rozważone alternatywy

- Reguły bezpośrednio w event handlerach UI — odrzucone z powodu sprzężenia z DOM-em i trudnego testowania.
- Agent AI jako sędzia — odrzucone z powodu halucynacji, niedeterminizmu i braku gwarancji legalności.
- Bezpośrednie skrypty kart mutujące dowolny stan — odrzucone; rozszerzenia muszą używać kontrolowanego API.

## Powiązania

- [Architektura](../ARCHITECTURE.md)
- [ADR 0001](0001-incremental-card-support.md)
