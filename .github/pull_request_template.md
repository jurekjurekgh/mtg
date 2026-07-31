## Problem i zakres

<!-- Jaki problem rozwiązuje ten PR? Czego świadomie nie obejmuje? -->

## Rozwiązanie

<!-- Najważniejsze decyzje implementacyjne. -->

## Jak sprawdzono

<!-- Komendy testów, scenariusze ręczne, replay/seed. -->

## Znane ograniczenia

<!-- Wpisz „brak”, jeśli nie ma. -->

## Dokumentacja i decyzje

- [ ] Zaktualizowano testy odpowiednio do zmiany.
- [ ] Zaktualizowano dokumentację lub zmiana jej nie wymaga.
- [ ] Zaktualizowano `docs/PROJECT_STATE.md`/roadmapę albo zmiana nie wpływa na status.
- [ ] Dodano/zastąpiono ADR albo zmiana nie jest decyzją architektoniczną.
- [ ] Sprawdzono granicę `GameState` → `PlayerView`, jeśli zmiana dotyczy danych gry.
- [ ] Losowość przechodzi przez kontrolowane API, jeśli zmiana ją wprowadza.
- [ ] Nie dodano sekretów ani nieuzgodnionych ciężkich zasobów.

## Workflow i scalanie

- [ ] Zmiany powstały na osobnej gałęzi; nie było pusha ani force pusha do `main`.
- [ ] Wszystkie wątki komentarzy zostaną rozwiązane przed scaleniem.
- [ ] Merge wykonuje właściciel metodą `Squash and merge` — autor PR nie scala sam.

> Zasady: [docs/WORKFLOW.md](../docs/WORKFLOW.md) i [ADR 0007](../docs/decisions/0007-protected-main-and-mandatory-pull-requests.md).
