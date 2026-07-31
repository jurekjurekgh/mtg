# MTG Engine

Headless, rozwijalny silnik do rozgrywania partii **Magic: The Gathering** dla kontrolowanego, stopniowo rozszerzanego zbioru kart. Docelowo silnik będzie zasilał samodzielny Wirtualny Stół, walidował wszystkie działania i umożliwiał grę człowieka z przeciwnikiem sterowanym algorytmicznie.

> Projekt nie próbuje obsłużyć wszystkich istniejących kart MtG ani od razu zaimplementować całych Comprehensive Rules. Obsługiwany zakres rośnie karta po karcie, wraz z testami wymaganych mechanik.

## Status

Headless engine działa: zamknięte milestone'y **M1–M3** (odtwarzalny sandbox, zasoby
i permanenty, combat) z pełnym kontraktem komend, oraz warstwa danych **M4**
na syntetycznym katalogu testowym — partie syntetyczne rozgrywają się całkowicie
przez protokół i odtwarzają z zapisu komend. Szczegóły:
[docs/ENGINE_MILESTONES.md](docs/ENGINE_MILESTONES.md).

```bash
npm test          # node --test na test/**/*.test.js — bez DOM-u i sieci
npm run build     # skleja moduły w jeden plik HTML (dist/mtg-table.html)
```

Aktualny stan, następne kroki i otwarte pytania: **[docs/PROJECT_STATE.md](docs/PROJECT_STATE.md)**.

## Cel

System ma rozdzielać cztery odpowiedzialności:

1. **Engine** — autorytatywny stan gry, reguły, legalność działań, stos, priorytet, combat i efekty.
2. **Cards** — definicje obsługiwanych kart oraz mechaniki wielokrotnego użytku.
3. **Controllers** — ten sam interfejs decyzji dla człowieka, bota deterministycznego, bota przeszukującego i opcjonalnego agenta LLM.
4. **Game Table** — interfejs prezentujący dozwolony widok gry i wysyłający intencje, bez samodzielnego rozstrzygania reguł.

Najważniejsza granica systemu:

```text
kontroler → legalna intencja/wybór → engine → zdarzenia i nowy widok → UI
```

Kontroler ani UI nie modyfikują bezpośrednio autorytatywnego stanu.

## Zakres projektu

- obecny docelowy katalog właściciela to około 400 kart;
- karty będą implementowane pojedynczo lub małymi partiami;
- pierwsze testowe rozgrywki powinny być możliwe po obsłużeniu około 20 odpowiednio dobranych kart;
- każda obsługiwana karta musi mieć jawny status i testy;
- ukryte informacje mają być filtrowane zgodnie z zasadami MtG (Fog of War);
- początkowym przeciwnikiem będzie bot algorytmiczny; LLM pozostaje opcjonalnym kontrolerem na później.

## Dokumentacja

- [Karta projektu i zakres](docs/PRODUCT.md)
- [Docelowa architektura](docs/ARCHITECTURE.md)
- [Audyt istniejącej aplikacji](docs/AUDIT_LEGACY_APP.md)
- [Roadmapa](docs/ROADMAP.md)
- [Bieżący stan projektu](docs/PROJECT_STATE.md)
- [Rejestr decyzji architektonicznych](docs/decisions/README.md)
- [Zasady współpracy](CONTRIBUTING.md)
- [Workflow pracy w repozytorium](docs/WORKFLOW.md)
- [Polityka bezpieczeństwa](SECURITY.md)
- [Instrukcja dla agentów](AGENTS.md)

## Jak wprowadzamy zmiany

Gałąź `main` jest chroniona. Każda zmiana — także dokumentacyjna i także wykonana przez agenta —
trafia do `main` wyłącznie przez Pull Request:

- bezpośredni push i force push do `main` są zabronione, bypass list jest pusta;
- wymagane approvals: 0, ale wszystkie komentarze w PR muszą być rozwiązane;
- scalanie wykonuje właściciel świadomą decyzją, metodą `Squash and merge`;
- required status checks włączymy po zbudowaniu stabilnego CI.

Prosta instrukcja krok po kroku: **[docs/WORKFLOW.md](docs/WORKFLOW.md)**.
Uzasadnienie: [ADR 0007](docs/decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Stos technologiczny i uruchamianie

Czysty JavaScript w standardzie ES Modules, bez bibliotek i bez bundlera. Testy uruchamia
wbudowany `node --test`, kontrakty opisuje JSDoc, a pilnują ich testy inwariantów.

Źródła są modularne, ale **do grania dostarczamy jeden plik HTML** generowany automatycznie
przez CI. Powód: moduły ES nie działają po otwarciu pliku z dysku (`file://`), a właściciel
gra na iPadzie, gdzie nie da się uruchomić lokalnego serwera.

| Tryb | Jak uruchomić | Ilustracje |
|---|---|---|
| Online | wejście na adres GitHub Pages | Scryfall |
| Lokalnie | otwarcie pobranego pliku HTML | własne z `./img/`, fallback Scryfall |

Reguły, talie i przebieg partii są w obu trybach identyczne. **Właściciel nie instaluje
ani nie buduje niczego** — sklejaniem zajmuje się CI.

Uzasadnienie i lista świadomych kompromisów:
[ADR 0011](docs/decisions/0011-modular-sources-single-file-artifact.md)
oraz [ADR 0008](docs/decisions/0008-plain-javascript-esm-no-build.md) (zastąpiona, ale
jej sekcja o kompromisach JavaScriptu nadal obowiązuje).

## Uruchomienie

```bash
npm test      # testy jednostkowe (node --test, bez zależności)
npm run build # sklejenie modułów -> dist/mtg-table.html
```

Zbudowany plik otwiera się dwuklikiem — także na iPadzie i iPhonie, bez serwera.

> **Konfiguracja publikacji:** włączenie CI i GitHub Pages wymaga uprawnień właściciela
> (agent nie ma `workflows` ani `pages`). Instrukcja: [docs/setup/URLOP_CHECKLISTA.md](docs/setup/URLOP_CHECKLISTA.md).

## Najbliższy etap

1. Szkielet `src/engine/`, `src/protocol/` i `test/` bez zależności od DOM-u i sieci.
2. CI uruchamiający testy przy każdym Pull Requeście.
3. Skrypt sklejający i publikacja na GitHub Pages — żeby postęp był sprawdzalny
   na docelowym urządzeniu od początku, a nie dopiero na końcu.
4. Tożsamość obiektów gry, strefy i kontrolowana zmiana strefy.
5. Seedowane RNG oraz projekcja `PlayerView` z testem braku wycieku ukrytych informacji.

## Uwaga o pliku `card_viewer_12_10_for_Github.html`

To **zamrożony snapshot referencyjny** istniejącej aplikacji właściciela, z wyciętymi sekretami.
Służy wyłącznie jako materiał audytowy. Nie jest rozwijany, nie jest naprawiany i zostanie
usunięty po Etapie 5 ([ADR 0009](docs/decisions/0009-standalone-game-table-instead-of-extraction.md)).

## Ważna uwaga o nazwie i materiałach

To nieoficjalny projekt hobbystyczny, niezwiązany z Wizards of the Coast. Magic: The Gathering i nazwy kart należą do ich odpowiednich właścicieli. Przed dodaniem dużej bazy danych lub grafik kart należy ustalić sposób ich przechowywania i status licencyjny; nie należy umieszczać ciężkich zasobów w Git bez uzgodnienia.
