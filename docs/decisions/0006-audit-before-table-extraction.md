# ADR 0006: Audyt przed wydzieleniem Wirtualnego Stołu

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Wirtualny Stół jest częścią większej aplikacji HTML/vanilla JavaScript do zarządzania kolekcją kart, alternatywnymi artami i częściowo komiksami. Kod nie znajduje się jeszcze w repozytorium, więc nie znamy zależności modułów, modelu danych ani storage.

Natychmiastowe przepisanie stołu grozi utratą działających funkcji i zduplikowaniem danych kolekcji.

## Decyzja

Najpierw importujemy istniejącą aplikację bez zmiany zachowania, uruchamiamy ją i dokumentujemy. Następnie wykonujemy audyt granic modułu stołu oraz jego zależności od danych kart, DOM-u, storage i funkcji kolekcjonerskich.

Standalone Wirtualny Stół będzie wydzielany etapami przez adaptery i stabilne kontrakty. Nie podejmujemy ostatecznej decyzji o monorepo, frameworku, backendzie ani migracji danych przed audytem.

## Konsekwencje

### Pozytywne

- Plan opiera się na faktach z kodu.
- Mniejsze ryzyko regresji aplikacji kolekcjonerskiej.
- Możliwość ponownego użycia danych kart i artów bez kopiowania.
- Łatwiejsze wskazanie najmniejszej bezpiecznej granicy integracji.

### Koszty i ryzyka

- Przez pewien czas stary stół i nowy engine będą rozwijane oddzielnie.
- Audyt opóźnia widoczną przebudowę UI, ale zmniejsza ryzyko projektu.
- Stary kod może wymagać adaptera zanim będzie możliwe wydzielenie.

## Rozważone alternatywy

- Przepisanie od zera bez importu starej aplikacji — odrzucone na tym etapie.
- Dodawanie zasad bezpośrednio do obecnego UI — odrzucone przez ADR 0002.
- Natychmiastowe przeniesienie całej aplikacji do frameworka — odłożone do audytu.

## Powiązania

- [Historia projektu](../PROJECT_HISTORY.md)
- [Roadmapa — Etap 0](../ROADMAP.md#etap-0--repozytorium-i-audyt)
