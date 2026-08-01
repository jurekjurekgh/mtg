# ADR 0005: Deterministyczne i odtwarzalne wykonanie

- **Status:** Zaakceptowana
- **Data:** 2026-07-31; zaakceptowana 2026-08-01
- **Decydenci:** właściciel projektu

## Kontekst

Silnik zasad i bot będą tworzyć długie sekwencje stanów, zawierające tasowanie i ewentualne losowe wybory. Bez kontroli losowości błąd wykryty po wielu turach może być niemożliwy do ponownego uruchomienia.

## Proponowana decyzja

Dla ustalonej wersji kodu, konfiguracji startowej, seeda i sekwencji decyzji engine powinien dawać ten sam rezultat.

- Wszystkie losowe operacje reguł przechodzą przez seedowane API RNG.
- Nie używamy bezpośrednio globalnego `Math.random()` ani zegara w logice gry.
- Zapis partii zawiera co najmniej wersję/protokół, seed, konfigurację oraz decyzje kontrolerów.
- Log pozwala odtworzyć przebieg na potrzeby testu regresyjnego.

Nie przesądza to jeszcze pełnego event sourcingu ani formatu trwałego replaya.

## Konsekwencje

### Pozytywne

- Powtarzalne testy i symulacje.
- Łatwiejsza diagnostyka błędów po wielu turach.
- Porównywanie wersji botów na tych samych rozdaniach.
- Kontrolowana, regulowana wariancja zachowania bota.

### Koszty i ryzyka

- Wszystkie źródła losowości muszą mieć jawny kontekst.
- Zmiana algorytmu RNG lub kolejności wywołań może zmienić replay.
- Potrzebna jest wersjonowana serializacja decyzji.
- Asynchroniczność kontrolerów nie może wpływać na kolejność reguł.

## Rozważone alternatywy

- Zapisywanie wyłącznie końcowego stanu — niewystarczające do diagnozy.
- Używanie standardowej niekontrolowanej losowości — prostsze, ale utrudnia regresje.
- Pełny event sourcing od pierwszego dnia — możliwe, ale zbyt wczesne bez prototypu modelu.

## Powiązania

- [Architektura — determinizm](../ARCHITECTURE.md#determinizm-i-odtwarzanie)

## Do rozstrzygnięcia

- Gwarancja replaya między wersjami engine czy tylko w ramach tej samej wersji?
- Czy RNG bota i RNG zasad mają osobne strumienie?
- Minimalny format zapisu pierwszego prototypu.
