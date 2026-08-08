# MTG Engine

Headless, rozwijalny silnik do rozgrywania partii **Magic: The Gathering** dla kontrolowanego, stopniowo rozszerzanego zbioru kart. Docelowo silnik będzie zasilał samodzielny Wirtualny Stół, walidował wszystkie działania i umożliwiał grę człowieka z przeciwnikiem sterowanym algorytmicznie.

> Projekt nie próbuje obsłużyć wszystkich istniejących kart MtG ani od razu zaimplementować całych Comprehensive Rules. Obsługiwany zakres rośnie karta po karcie, wraz z testami wymaganych mechanik.

## Status

Headless engine działa: zamknięte milestone'y **M1–M5** (odtwarzalny sandbox, zasoby,
combat, warstwa danych i pierwsza pionowa ścieżka UI — przez stołowy HTML rozgrywa
się pełną partię człowiek–bot), a na nim **M8–M43: Batche 1–21 (138 wspieranych kart
realnych**, pełne mechaniki — od liczników, morph i ninjutsu po Adventure, Kicker,
Crew, double strike, lifelink, Station (EOE Spacecraft), Sagę CR 714 (Jill//Shiva),
Metalcraft, prewencję „this turn", must-attack, kontrczary na dowolny czar, ping-pong
kontroli, inicjatywę, clash, phyrexian manę, czary wielocelowe, aury Enchant player,
defender, flash, Food, discover, explore, craft, Escape, modal Choose one, Tarmogoyf)
oraz **M31–M32: kreator talii singleton** — max 1 kopia (lądy podstawowe dowolnie),
min. 15 nielandowych; **9 talii** (green/black/red/innistrad/azorius/wiedzmin/graveyard/tokens/spellslinger)
zastąpiło dotychczasowe, **M34/M39–M42: UX stołu** — czary za manę produkowalną z auto-tapem,
wskaźnik tury jako warstwa fixed, kreator many, mulligan londyński, pauza po zagraniu bota
(klik „Rozumiem"), swipe karuzeli, polskie logi, tyły DFC poza taliami, mirror match,
oraz **M44–M48 / T1–T6: weryfikacja reguł MtG** — kolorowe koszty zdolności, finality dla każdej
przyczyny, dies/leaves, discard/hand-top wybory gracza, Unstable Frontier podtypy (CR 305.6),
search choice z fail-to-find, pay-or-sacrifice, optional pay, Moonlit, Lyre X, hexproof,
choroba + {T}, hand size 7, first-turn bez draw, anihilacja liczników, rozdział obrażeń
(CR 510.1c), mana per step, tokeny, legend face-down, morph koszty z pipami, permanenty
na stosie, cele triggerów jako wybór gracza (resolve_trigger_target), auto-tap pipów właściwą
maną, triggery na stosie, regeneracja.
B0 harness (B1–B5 bota, tune-bot), ilustracje Scryfall, ChoiceRequest i benchmark.
Bieżący stan: **1025/1025 testów**, artefakt **49 modułów / 1090 kB**. Szczegóły:
[docs/ENGINE_MILESTONES.md](docs/ENGINE_MILESTONES.md) i [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).

```bash
npm test          # node --test na test/**/*.test.js — bez DOM-u i sieci
npm run build     # skleja moduły w jeden plik HTML (dist/mtg-table.html)
```

### Jak zagrać

- **Przez adres URL:** artefakt publikuje się automatycznie na GitHub Pages po scaleniu
  do `main` (workflow `pages.yml`) — wejdź na adres strony z dowolnego urządzenia.
- **Z pobranego pliku:** uruchom `npm run build` i otwórz `dist/mtg-table.html`
  bezpośrednio w przeglądarce (moduły są sklejone, więc działa też z `file://`,
  np. na iPadzie — ADR 0011).

Na stronie wybierz seed i talie (są wstrzyknięte z katalogu `decks/`), naciśnij
„Rozpocznij partię" i graj przyciskami akcji: sesja sama rozgrywa ruchy bota
i przewija okna, w których masz do wyboru wyłącznie pass. Zapis partii (seed + komendy)
eksportujesz do pliku i importujesz w celu weryfikacji — replay odtwarza partię
komenda po komendzie.

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

Etapy 1–5 zamknięte, Etap 2/3 przekroczony (138 kart >> docelowe ~20), Etap 4 bota
zamknięty (heurystyka + modelowanie, harness B0, tune-bot), Etap 5 stołu zamknięty
(gra człowiek–bot na iPadzie przez Pages / file://).

Kolejne kroki:
1. **Batch 22** — kolejne 10 kart z listy właściciela (Scryfall → definicje → testy → talie singleton → B0).
2. Dalsze czyszczenie luk MtG: `any target` (Reliquary Dragon) i `Mesmerize` Sagi jako wybór gracza, pozostałe determinizmy kosztów (jeśli się pojawią).
3. Ewentualne strojenie bota pod nowe mechaniki (Adventure/Kicker/Crew) i B0 0.78/0.57.

Szczegóły kolejki i blokery: [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md), [docs/ROADMAP.md](docs/ROADMAP.md).

## Uwaga o pliku `card_viewer_12_10_for_Github.html`

To **zamrożony snapshot referencyjny** istniejącej aplikacji właściciela, z wyciętymi sekretami.
Służy wyłącznie jako materiał audytowy. Nie jest rozwijany, nie jest naprawiany i zostanie
usunięty po Etapie 5 ([ADR 0009](docs/decisions/0009-standalone-game-table-instead-of-extraction.md)).

## Ważna uwaga o nazwie i materiałach

To nieoficjalny projekt hobbystyczny, niezwiązany z Wizards of the Coast. Magic: The Gathering i nazwy kart należą do ich odpowiednich właścicieli. Przed dodaniem dużej bazy danych lub grafik kart należy ustalić sposób ich przechowywania i status licencyjny; nie należy umieszczać ciężkich zasobów w Git bez uzgodnienia.
