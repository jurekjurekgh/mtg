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
| [0005](0005-deterministic-replayable-execution.md) | Deterministyczne i odtwarzalne wykonanie | Zaakceptowana |
| [0006](0006-audit-before-table-extraction.md) | Audyt przed wydzieleniem Wirtualnego Stołu | Zaakceptowana |
| [0007](0007-protected-main-and-mandatory-pull-requests.md) | Chroniony `main` i obowiązkowe Pull Requesty | Zaakceptowana |
| [0008](0008-plain-javascript-esm-no-build.md) | Czysty JavaScript (ESM) bez kroku budowania | Zastąpiona przez 0011 |
| [0009](0009-standalone-game-table-instead-of-extraction.md) | Standalone Game Table zamiast wydzielania z aplikacji | Zaakceptowana |
| [0010](0010-card-rules-data-in-repository.md) | Dane reguł kart utrzymywane ręcznie w repozytorium | Zaakceptowana |
| [0011](0011-modular-sources-single-file-artifact.md) | Modularne źródła, jednoplikowy artefakt i dwa tryby uruchomienia | Zaakceptowana |
| [0012](0012-deck-builder-and-text-deck-format.md) | Kreator talii i wspólny tekstowy format talii | Zaakceptowana |
| [0013](0013-agent-arena-sessions-and-mandatory-handoff.md) | Sesje Agent Arena i obowiązkowy handoff po scaleniu PR | Zaakceptowana |
| [0014](0014-card-definitions-single-module.md) | Definicje kart w pojedynczym module `src/cards/card-data.js` (zastępuje §1 ADR 0010) | Zaakceptowana |
| [0015](0015-colored-mana-pool.md) | Kolorowa pula many (MtG-correct; zastępuje uproszczenie bezbarwnej puli z M2) | Proponowana |
| [0016](0016-session-audit-and-surgical-patching.md) | Audyt poprzedniego PR na starcie sesji i chirurgiczne patchowanie | Zaakceptowana |
| [0017](0017-playerview-completeness-contract.md) | Kompletność informacji publicznych w PlayerView (kontrakt widok↔kontroler; uzupełnia 0003) | Zaakceptowana |
| [0018](0018-benchmark-full-only-on-owner-command.md) | Pełny benchmark B0 wyłącznie na wyraźną komendę właściciela; CLI domyślnie profil szybki | Zaakceptowana |
| [0019](0019-test-tiers-and-generic-catalog-coverage.md) | Tiers testów — szybki rdzeń, wolny manifest i generyczne pokrycie katalogu | Zaakceptowana |
| [0020](0020-mandatory-session-workflow-pr-audit-incremental.md) | Obowiązkowy tryb sesji agentskiej — PR, audyt, inkrementalne commity | Zaakceptowana |

## Gdzie zapisać regułę (ADR vs LESSONS vs handoff)

Uwaga właściciela (2026-08-14): reguły trwałe nie mogą mieszkać w handoffie,
bo handoff opisuje JEDNĄ sesję i traci aktualność. Podział:

| Rodzaj treści | Miejsce |
|---|---|
| Wiążąca decyzja o granicach, modelu stanu, protokole, deploymencie | **ADR** (`docs/decisions/`) |
| Powtarzalny wniosek diagnostyczny, pułapka, heurystyka pracy | **[docs/LESSONS.md](../LESSONS.md)** |
| Zasada obowiązująca każdego agenta przy pracy | **AGENTS.md** |
| Stan i kolejka jednej sesji | `docs/setup/HANDOFF_*.md` (jednorazowy) |
| Roadmapa jednego zadania | `docs/plans/PLAN_*.md` (jednorazowy) |

Spójności rejestru ADR i formatu lekcji pilnuje `test/docs-decisions.test.js`.

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
