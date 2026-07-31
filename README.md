# MTG Engine

Headless, rozwijalny silnik do rozgrywania partii **Magic: The Gathering** dla kontrolowanego, stopniowo rozszerzanego zbioru kart. Docelowo silnik będzie zasilał samodzielny Wirtualny Stół, walidował wszystkie działania i umożliwiał grę człowieka z przeciwnikiem sterowanym algorytmicznie.

> Projekt nie próbuje obsłużyć wszystkich istniejących kart MtG ani od razu zaimplementować całych Comprehensive Rules. Obsługiwany zakres rośnie karta po karcie, wraz z testami wymaganych mechanik.

## Status

Projekt znajduje się w fazie definiowania fundamentów. Kod obecnej aplikacji kolekcjonerskiej i Wirtualnego Stołu nie został jeszcze zaimportowany do repozytorium.

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

## Najbliższy etap

1. Zaimportować istniejącą aplikację bez naruszania jej działania.
2. Wykonać audyt części kolekcjonerskiej i Wirtualnego Stołu.
3. Ustalić granice pakietów, stos technologiczny i kontrakt danych kart.
4. Zaimplementować minimalny headless engine oraz testy bez zależności od UI.

## Ważna uwaga o nazwie i materiałach

To nieoficjalny projekt hobbystyczny, niezwiązany z Wizards of the Coast. Magic: The Gathering i nazwy kart należą do ich odpowiednich właścicieli. Przed dodaniem dużej bazy danych lub grafik kart należy ustalić sposób ich przechowywania i status licencyjny; nie należy umieszczać ciężkich zasobów w Git bez uzgodnienia.
