# ADR 0005: Deterministyczne i odtwarzalne wykonanie

- **Status:** Zaakceptowana
- **Data:** 2026-07-31; zaakceptowana 2026-08-01
- **Decydenci:** właściciel projektu
- **Nota redakcyjna (2026-08-14):** nagłówek „Proponowana decyzja" zmieniony na
  „Decyzja" (zgodność z szablonem ADR i statusem *Zaakceptowana*). Treść decyzji
  bez zmian.

## Kontekst

Silnik i bot tworzą długie sekwencje stanów z tasowaniem i ewentualnymi losowymi
wyborami. Bez kontroli losowości błąd wykryty po wielu turach może być
niemożliwy do ponownego uruchomienia.

## Decyzja

Dla ustalonej wersji kodu, konfiguracji startowej, seeda i sekwencji decyzji
engine daje ten sam rezultat.

- Wszystkie losowe operacje reguł przechodzą przez seedowane API RNG; w logice
  gry nie używamy globalnego `Math.random()` ani zegara.
- Zapis partii zawiera co najmniej wersję/protokół, seed, konfigurację oraz
  decyzje kontrolerów.
- Log pozwala odtworzyć przebieg na potrzeby testu regresyjnego.

Nie przesądza to jeszcze pełnego event sourcingu ani formatu trwałego replaya.

## Konsekwencje

### Pozytywne

- Powtarzalne testy i symulacje; łatwiejsza diagnostyka po wielu turach.
- Porównywanie wersji botów na tych samych rozdaniach.
- Kontrolowana, regulowana wariancja zachowania bota.

### Koszty i ryzyka

- Wszystkie źródła losowości muszą mieć jawny kontekst.
- Zmiana algorytmu RNG lub kolejności wywołań może zmienić replay.
- Potrzebna jest wersjonowana serializacja decyzji.
- Asynchroniczność kontrolerów nie może wpływać na kolejność reguł.

## Rozważone alternatywy

- Zapis wyłącznie stanu końcowego — niewystarczający do diagnozy.
- Standardowa niekontrolowana losowość — prostsza, ale utrudnia regresje.
- Pełny event sourcing od pierwszego dnia — zbyt wczesny bez prototypu modelu.

## Do rozstrzygnięcia

- Gwarancja replaya między wersjami engine czy tylko w ramach jednej wersji?
- Czy RNG bota i RNG zasad mają osobne strumienie?
- Minimalny format zapisu pierwszego prototypu.

## Powiązania

- [Architektura — determinizm](../ARCHITECTURE.md#determinizm-i-odtwarzanie)
