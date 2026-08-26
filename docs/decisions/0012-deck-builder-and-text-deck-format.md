# ADR 0012: Kreator talii i wspólny tekstowy format talii

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Talia ma być możliwa do zbudowania na iPadzie, ale nie może zależeć od `localStorage`
ani od arkusza Google w czasie działania. Talia powinna być jednocześnie łatwa do
przejrzenia w PR, wklejenia do czatu i zapisania w repozytorium.

## Decyzja

Po dodaniu pierwszych obsługiwanych kart powstanie kreator talii w UI, który:

- pokazuje wyłącznie karty ze statusem `supported`;
- filtruje po `Plan`, `Set` i nazwie;
- liczy kolory oraz lądy osobno;
- waliduje limit czterech kopii dla kart niebędących landami podstawowymi;
- pozwala na dowolną liczbę landów podstawowych;
- waliduje ustalony rozmiar talii, gdy format zostanie przyjęty;
- udostępnia przyciski „kopiuj” i „pobierz”.

Format zapisu, eksportu, kopiowania i pliku talii w repozytorium jest dokładnie taki sam:

```text
# Nazwa talii

20x Mountain
4x Lightning Bolt
```

Nie powstaje osobny JSON dla talii. Pliki talii w repozytorium są tekstem w tym formacie.

Definicje kart w repozytorium zawierają także pola `Set` i `Plan` przepisane z kolekcji.
Aplikacja nie odpytuje arkusza Google w czasie działania.

## Plan wdrożenia

Kreator i parser talii wchodzą po pierwszych obsługiwanych kartach, razem z registry
statusu wsparcia i pierwszym formatem talii. Do tego czasu engine rozwija się na
syntetycznych obiektach testowych, bez UI kreatora.

## Konsekwencje

### Pozytywne

- Talia jest przenośna między UI, czatem i repozytorium.
- Brak utraty danych po wyczyszczeniu `localStorage`.
- Repozytorium pozostaje źródłem prawdy dla danych kart i talii.
- Kreator nie proponuje kart, których engine nie obsługuje.

### Koszty i ryzyka

- Zmiana talii wymaga pobrania pliku albo commita; nie jest to edycja trwała w przeglądarce.
- Szczegółowa definicja „landu podstawowego” musi być dostępna w danych karty.
- Ostateczny rozmiar talii i nazwa pola `Plan` muszą zachować zgodność z kolekcją właściciela.

## Powiązania

- [ADR 0010 — dane reguł kart w repozytorium](0010-card-rules-data-in-repository.md)
- [ADR 0011 — talie wersjonowane i brak trwałości localStorage](0011-modular-sources-single-file-artifact.md)
- [PROJECT_HISTORY](../PROJECT_HISTORY.md)
