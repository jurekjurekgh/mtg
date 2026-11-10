# MTG Engine

Silnik i stół do gry w **Magic: The Gathering** — partia człowiek contra bot
w przeglądarce albo bez interfejsu, z jawnym, testowanym zbiorem kart: 639 kart
obsługiwanych, 54 tokeny i 9 tylnych stron kart dwustronnych
(rośnie tylko o karty z kolekcji właściciela, [ADR 0029](docs/decisions/0029-catalog-grows-only-from-owner-collection.md)).

Silnik jest autorytatywnym źródłem stanu: kontroler i stół wysyłają wyłącznie
legalne intencje, a wszystkie reguły rozstrzyga engine. Projekt nie próbuje
obsłużyć wszystkich kart MtG — zakres rośnie karta po karcie, każda z testami
wymaganych mechanik.

> **Agent / nowa sesja:** jedyny plik startowy, niezależny od treści czatu, to
> [`AGENTS.md`](AGENTS.md) — najpierw on, potem wszystkie ADR-y
> ([rejestr](docs/decisions/README.md)), `docs/LESSONS.md` i
> `docs/setup/ENVIRONMENT.md`.

## Jak zagrać

- **Online:** <https://jurekjurekgh.github.io/mtg/> — publikacja po scaleniu do
  `main` (workflow `pages.yml`). Działa na iPadzie i iPhonie.
- **Z pliku:** `npm run build`, potem otwórz `dist/mtg-table.html` dwuklikiem
  (moduły są sklejone, więc działa z `file://` — [ADR 0011](docs/decisions/0011-modular-sources-single-file-artifact.md)).

Wybierz seed i dwie talie, naciśnij „Rozpocznij partię” i graj przyciskami
akcji. Zapis partii (seed + komendy) eksportuje się do pliku i odtwarza
komenda po komendzie — determinizm to kontrakt ([ADR 0005](docs/decisions/0005-deterministic-replayable-execution.md)).

## Co jest w środku

| Warstwa | Gdzie | Co robi |
|---|---|---|
| Engine | `src/engine/` | stos, priorytet, combat, warstwy CR 613, SBA, FoW, replay |
| Karty | `src/cards/` | definicje kart i mechaniki wielokrotnego użytku ([ADR 0014](docs/decisions/0014-card-definitions-single-module.md)) |
| Kontrolery | `src/controllers/` | jeden interfejs decyzji: człowiek, bot heurystyczny, bot losowy |
| Stół | `src/table/` | UI gracza — widzi tylko dozwolone informacje ([ADR 0003](docs/decisions/0003-player-specific-views-and-fow.md)) |
| Talie | `decks/` | tekstowe pliki talii budowane generatorem planów |

Zasada granicy systemu: `kontroler → legalna intencja → engine → zdarzenia i widok → UI`.
Ani kontroler, ani UI nie modyfikują stanu gry bezpośrednio. Szczegóły:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), decyzje w [rejestrze ADR](docs/decisions/README.md).

## Dokumentacja

- [Karta projektu](docs/PRODUCT.md) · [Architektura](docs/ARCHITECTURE.md) · [Roadmapa](docs/ROADMAP.md) · [Milestone'y](docs/ENGINE_MILESTONES.md)
- [Ilustracje kart](docs/setup/ILUSTRACJE_KART.md) · [Dźwięki kart](docs/setup/DZWIEKI_KART.md) · [Narzędzia audytu stołu](docs/setup/TESTER_STOLU.md)
- [Historia projektu (dziennik sesji)](docs/PROJECT_HISTORY.md) · [Lekcje](docs/LESSONS.md) · [Rejestr decyzji](docs/decisions/README.md)
- [Zasady współpracy](CONTRIBUTING.md) · [Workflow](docs/WORKFLOW.md) · [Bezpieczeństwo](SECURITY.md) · [Instrukcja dla agentów](AGENTS.md)

Stan na koniec ostatniej sesji (liczby testów, rozmiar artefaktu, otwarte
zadania) podaje najnowszy handoff w [docs/setup/](docs/setup/) i opis ostatniego PR.

## Talie

Talie **buduje generator** `tools/generate-plan-decks.mjs` (źródło prawdy
przydziału karty do talii); `test/repo-decks.test.js` pilnuje zgodności plików
w `decks/` z generatorem. Zasady: talie per PLAN
([ADR 0023](docs/decisions/0023-decks-per-plan-and-benchmark-sample.md)),
obowiązkowy podział kolorystyczny talii ≥30 kart nielandowych
([ADR 0024](docs/decisions/0024-deck-split-by-colors-and-rotating-benchmark.md)).
Zasady nadrzędne: singleton (1× karta poza basic-landami), basic-lądy ~2:1 do
reszty, min. 15 kart nielandowych na talię.

**Ta lista jest aktualizowana przy każdej zmianie zestawu talii** (liczności
liczone z plików `decks/*.txt`).

Ostatnia kolumna obejmuje wszystkie karty poza basic-landami (także nonbasic landy),
zgodnie z konwencją generatora i strażnika liczności.

### Talie jednoplanowe

| Plik | Nazwa | Kolory | Kart łącznie | w tym basic-lądy | pozostałych (nie-basic) |
|---|---|---|---:|---:|---:|
| `alara` | Alara | WUBRG | 41 | 14 | 27 |
| `dominaria-brg` | Dominaria (BRG) | BRG | 36 | 12 | 24 |
| `dominaria-wu` | Dominaria (WU) | WU | 32 | 11 | 21 |
| `eldraine` | Eldraine | WUBRG | 27 | 9 | 18 |
| `final-fantasy` | Final Fantasy | WUBRG | 29 | 10 | 19 |
| `forgotten-realms-br` | Forgotten Realms (BR) | BR | 23 | 8 | 15 |
| `forgotten-realms-wug` | Forgotten Realms (WUG) | WUG | 23 | 8 | 15 |
| `innistrad-brg` | Innistrad (BRG) | BRG | 32 | 11 | 21 |
| `innistrad-wu` | Innistrad (WU) | WU | 33 | 11 | 22 |
| `ixalan` | Ixalan | UBRG | 29 | 10 | 19 |
| `kaldheim` | Kaldheim | WUBRG | 23 | 8 | 15 |
| `kaladesh` | Kaladesh | WUBRG | 32 | 11 | 21 |
| `lorwyn` | Lorwyn | WUBRG | 23 | 8 | 15 |
| `mirrodin-brg` | Mirrodin (BRG) | BRG | 39 | 13 | 26 |
| `mirrodin-wu` | Mirrodin (WU) | WU | 32 | 11 | 21 |
| `ravnica-bg` | Ravnica (BG) | BG | 23 | 8 | 15 |
| `ravnica-wur` | Ravnica (WUR) | WUR | 27 | 9 | 18 |
| `srodziemie` | Śródziemie | WUBRG | 33 | 11 | 22 |
| `tarkir-bg` | Tarkir (BG) | UBG | 41 | 14 | 27 |
| `tarkir-wur` | Tarkir (WUR) | WUR | 39 | 13 | 26 |
| `the-edge` | The Edge | WUBRG | 24 | 8 | 16 |
| `theros` | Theros | WUBRG | 30 | 10 | 20 |
| `warhammer-ubr` | Warhammer Fantasy (UBR) | UBR | 41 | 14 | 27 |
| `warhammer-wg` | Warhammer Fantasy (WG) | WUBRG | 27 | 9 | 18 |
| `wiedzmin-bg` | Wiedźmin (BG) | BG | 32 | 11 | 21 |
| `wiedzmin-wur` | Wiedźmin (WUR) | WUR | 29 | 10 | 19 |
| `zendikar-rg` | Zendikar (RG) | RG | 23 | 8 | 15 |
| `zendikar-wu` | Zendikar (WU) | WU | 23 | 8 | 15 |

### Worki (małe plany — przejściowe, ADR 0023)

| Plik | Nazwa | Kolory | Kart łącznie | w tym basic-lądy | pozostałych (nie-basic) |
|---|---|---|---:|---:|---:|
| `worek-basni` | Worek: Baśni | WUBRG | 33 | 11 | 22 |
| `worek-dziki` | Worek: Dzikie Światy | WUBRG | 23 | 8 | 15 |
| `worek-legend` | Worek: Legendy | WUBRG | 33 | 11 | 22 |
| `worek-mroczny` | Worek: Mroczne Światy | WUBRG | 26 | 9 | 17 |

Szczegóły formatu i manabazy: [`decks/README.md`](decks/README.md).

## Uruchomienie

Wymagania: Node.js ≥ 22. Projekt nie ma zależności runtime ani bundlera —
czysty JavaScript (ES Modules).

```bash
npm test      # szybki rdzeń testów (node --test)
npm run build # sklejenie modułów -> dist/mtg-table.html
```

Pełne bramy: `npm run test:slow` (ciężkie pliki) i `npm run test:all`
(to samo, co CI przy PR). Testy uruchamiaj z przekierowaniem do `.arena/` —
pełne wyjście pakietu zawiesza przeglądarkę:

```bash
mkdir -p .arena
npm run test:all > .arena/test-all.log 2>&1; rc=$?; tail -n 12 .arena/test-all.log; exit "$rc"
```

## Zasady zmian

`main` jest chroniona: każda zmiana — także dokumentacyjna, także od agenta —
wchodzi przez **Pull Request** scalany przez właściciela metodą
`Squash and merge` (bez pushu i force pushu do `main`,
[ADR 0007](docs/decisions/0007-protected-main-and-mandatory-pull-requests.md)).
Każda obsługiwana karta ma status i testy; reguły są generyczne, bez wyjątków
po nazwie karty ([ADR 0002](docs/decisions/0002-authoritative-card-agnostic-engine.md)),
a nowa karta wchodzi w pełnym zakresie Oracle albo wcale
([ADR 0022](docs/decisions/0022-full-oracle-or-unsupported.md)).

Szczegóły: [CONTRIBUTING.md](CONTRIBUTING.md) i [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Nazwa i materiały

To nieoficjalny projekt hobbystyczny, niezwiązany z Wizards of the Coast.
Magic: The Gathering i nazwy kart należą do ich właścicieli. Grafiki i nagrania
kart (`img/`, `snd/`) są opcjonalne, trzymane **poza** repozytorium i ładowane
lokalnie — szczegóły i status licencyjny: [SECURITY.md](SECURITY.md).
