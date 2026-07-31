# ADR 0001: Ograniczony i stopniowo rozszerzany katalog kart

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Magic: The Gathering obejmuje dziesiątki tysięcy kart i dużą liczbę wyjątków. Celem projektu jest gra z prywatnym, wybranym katalogiem właściciela, liczącym obecnie około 400 kart. Próba pełnej obsługi całej gry przed pierwszą rozgrywką uniemożliwiłaby szybkie dostarczenie wartości.

## Decyzja

Karty będą implementowane pojedynczo lub małymi partiami. Brakujące mechaniki powstaną wtedy, gdy zażąda ich konkretna karta, ale będą projektowane jako elementy wielokrotnego użytku tam, gdzie ma to sens.

Pierwszym celem grywalności jest około 20 odpowiednio dobranych, w pełni przetestowanych kart. Katalog będzie następnie doganiał i rozwijał prywatną bazę właściciela.

Każda karta otrzyma jawny status wsparcia. Nieobsługiwana karta nie może po cichu wejść do normalnej rozgrywki.

## Konsekwencje

### Pozytywne

- Szybka droga do pierwszej grywalnej wersji.
- Zakres pracy pozostaje kontrolowany.
- Mechaniki rozwijają się na podstawie realnych potrzeb.
- Można jednoznacznie powiedzieć, które talie są legalne dla engine.

### Koszty i ryzyka

- Nie każda karta z bazy będzie od razu dostępna.
- Kolejność kart może wcześnie wymusić złożoną mechanikę.
- Każda nowa interakcja może ujawnić brak w istniejącym modelu.
- Potrzebny jest registry statusu i ograniczeń wsparcia.

## Rozważone alternatywy

- Pełna implementacja Comprehensive Rules przed kartami — odrzucona jako zbyt duży zakres.
- Interpretowanie dowolnego tekstu karty przez LLM w czasie gry — odrzucone jako niedeterministyczne i niewiarygodne źródło legalności.
- Zakodowanie wyłącznie dwóch niezmiennych talii — zbyt ograniczające dla rozwijanej kolekcji.

## Powiązania

- [Karta projektu](../PRODUCT.md)
- [Roadmapa](../ROADMAP.md)
