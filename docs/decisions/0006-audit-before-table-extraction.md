# ADR 0006: Audyt przed wydzieleniem Wirtualnego Stołu

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Wirtualny Stół jest częścią większej aplikacji HTML/vanilla JS (kolekcja kart,
alternatywne arty, częściowo komiksy). Kod nie jest jeszcze w repozytorium: nie
znamy zależności modułów, modelu danych ani storage. Natychmiastowe przepisanie
stołu grozi utratą działających funkcji i zduplikowaniem danych kolekcji.

## Decyzja

- Najpierw importujemy istniejącą aplikację bez zmiany zachowania,
  uruchamiamy ją i dokumentujemy. Potem audytujemy granice modułu stołu oraz
  jego zależności od danych kart, DOM-u, storage i funkcji kolekcjonerskich.
- Standalone Wirtualny Stół wydzielamy etapami, przez adaptery i stabilne
  kontrakty.
- Przed audytem nie podejmujemy ostatecznej decyzji o monorepo, frameworku,
  backendzie ani migracji danych.

## Konsekwencje

### Pozytywne

- Plan oparty na faktach z kodu; mniejsze ryzyko regresji aplikacji
  kolekcjonerskiej.
- Ponowne użycie danych kart i artów bez kopiowania.
- Łatwiej wskazać najmniejszą bezpieczną granicę integracji.

### Koszty i ryzyka

- Przez pewien czas stary stół i nowy engine rozwijają się oddzielnie.
- Audyt opóźnia widoczną przebudowę UI (zmniejsza ryzyko projektu).
- Stary kod może wymagać adaptera przed wydzieleniem.

## Rozważone alternatywy

- Przepisanie od zera bez importu starej aplikacji — odrzucone na tym etapie.
- Dodanie zasad bezpośrednio do obecnego UI — odrzucone przez ADR 0002.
- Natychmiastowe przeniesienie całości do frameworka — odłożone do audytu.

## Powiązania

- [Historia projektu](../PROJECT_HISTORY.md)
- [Roadmapa — Etap 0](../ROADMAP.md#etap-0--repozytorium-i-audyt)
