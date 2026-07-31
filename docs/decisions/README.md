# Rejestr decyzji architektonicznych (ADR)

ADR zapisują decyzje, których nie powinno się odtwarzać z historii czatu. Każdy dokument opisuje kontekst, wybór i jego konsekwencje.

## Statusy

- **Proponowana** — kierunek do dyskusji; nie jest jeszcze zobowiązaniem.
- **Zaakceptowana** — obowiązuje w projekcie.
- **Odrzucona** — rozważona, ale nieprzyjęta.
- **Zastąpiona** — historyczna; nowszy ADR wskazuje aktualną decyzję.
- **Wycofana** — nie ma już zastosowania.

## Decyzje

| ADR | Tytuł | Status |
|---|---|---|
| [0001](0001-incremental-card-support.md) | Ograniczony i stopniowo rozszerzany katalog kart | Zaakceptowana |
| [0002](0002-authoritative-card-agnostic-engine.md) | Autorytatywny, niezależny od konkretnych kart engine | Zaakceptowana |
| [0003](0003-player-specific-views-and-fow.md) | Widoki graczy i Fog of War | Zaakceptowana |
| [0004](0004-pluggable-controllers-bot-first.md) | Wymienne kontrolery i bot algorytmiczny jako pierwszy przeciwnik | Zaakceptowana |
| [0005](0005-deterministic-replayable-execution.md) | Deterministyczne i odtwarzalne wykonanie | Proponowana |
| [0006](0006-audit-before-table-extraction.md) | Audyt przed wydzieleniem Wirtualnego Stołu | Zaakceptowana |
| [0007](0007-protected-main-and-mandatory-pull-requests.md) | Chroniony `main` i obowiązkowe Pull Requesty | Zaakceptowana |
| [0008](0008-plain-javascript-esm-no-build.md) | Czysty JavaScript (ESM) bez kroku budowania | Zaakceptowana |
| [0009](0009-standalone-game-table-instead-of-extraction.md) | Standalone Game Table zamiast wydzielania z aplikacji | Zaakceptowana |
| [0010](0010-card-rules-data-in-repository.md) | Dane reguł kart utrzymywane ręcznie w repozytorium | Zaakceptowana |

## Kiedy utworzyć ADR

ADR jest potrzebny, gdy wybór:

- trudno będzie później odwrócić;
- wpływa na kilka modułów lub sposób dodawania kart;
- dotyczy modelu stanu, protokołu, bezpieczeństwa informacji, persistence albo deploymentu;
- rozstrzyga spór między istotnymi alternatywami.

Nie potrzeba ADR dla zwykłej implementacji lokalnej, nazwy prywatnej funkcji czy naprawy błędu.

## Szablon

```md
# ADR NNNN: Tytuł

- **Status:** Proponowana
- **Data:** YYYY-MM-DD
- **Decydenci:** ...

## Kontekst

...

## Decyzja

...

## Konsekwencje

### Pozytywne

- ...

### Koszty i ryzyka

- ...

## Rozważone alternatywy

- ...

## Powiązania

- ...
```

Po zaakceptowaniu nie zmieniamy znaczenia historycznej decyzji. Jeżeli kierunek się zmieni, nowy ADR zastępuje poprzedni.
