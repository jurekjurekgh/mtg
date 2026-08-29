# ADR 0001: Ograniczony i stopniowo rozszerzany katalog kart

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

MtG to dziesiątki tysięcy kart z dużą liczbą wyjątków. Celem projektu jest gra
z prywatnym katalogiem właściciela (~400 kart); pełna obsługa całej gry przed
pierwszą rozgrywką uniemożliwiłaby szybkie dostarczenie wartości.

## Decyzja

- Karty implementujemy pojedynczo lub małymi partiami. Brakujące mechaniki
  powstają, gdy zażąda ich konkretna karta, ale projektujemy je jako elementy
  wielokrotnego użytku.
- Pierwszy cel grywalności: ~20 dobranych, w pełni przetestowanych kart; potem
  katalog dogania prywatną bazę właściciela.
- Każda karta ma jawny status wsparcia. Nieobsługiwana karta nie wchodzi po
  cichu do normalnej rozgrywki.

## Konsekwencje

### Pozytywne

- Szybka droga do pierwszej grywalnej wersji; zakres pracy pod kontrolą.
- Mechaniki rozwijają się na podstawie realnych potrzeb.
- Jednoznaczna odpowiedź, które talie są legalne dla engine.

### Koszty i ryzyka

- Nie każda karta z bazy będzie dostępna od razu.
- Kolejność kart może wcześnie wymusić złożoną mechanikę.
- Nowa interakcja może ujawnić brak w modelu.
- Potrzebny jest rejestr statusu i ograniczeń wsparcia.

## Rozważone alternatywy

- Pełna implementacja Comprehensive Rules przed kartami — zbyt duży zakres.
- Interpretacja dowolnego tekstu karty przez LLM w czasie gry —
  niedeterministyczne i niewiarygodne źródło legalności.
- Zakodowanie wyłącznie dwóch niezmiennych talii — zbyt ograniczające.

## Powiązania

- [Karta projektu](../PRODUCT.md)
- [Roadmapa](../ROADMAP.md)
