# Plan milestone'ów headless engine

Dokument roboczy określa większe paczki pracy. Nie zastępuje `ROADMAP.md`; opisuje
kolejność realizacji technicznej i kryteria, po których można przejść dalej.

## M1 — Odtwarzalny headless sandbox

**Status:** prawie zamknięty — brakowało formalnego testu całej ścieżki replay.

Zakres:

- [x] rozdzielenie definicji karty, instancji i obiektu gry;
- [x] strefy i kontrolowana zmiana strefy;
- [x] GameState, Command, Event, ChoiceRequest i PlayerView;
- [x] Fog of War ręki i biblioteki;
- [x] seedowane RNG, tasowanie i instalacja talii;
- [x] ręka otwarcia;
- [x] tura, kroki i priorytet;
- [x] dobieranie oraz przegrana z pustej biblioteki;
- [x] życie, obrażenia, koncesja i warunki końca;
- [x] registry statusów kart i walidacja supported;
- [x] limit kopii z wyjątkiem landów podstawowych;
- [x] log zaakceptowanych komend, replay i fingerprint;
- [x] RandomBot i deterministyczna symulacja;
- [x] walidator inwariantów.

**Exit:** identyczna konfiguracja, seed i komendy dają identyczny fingerprint; widok
kontrolera nie zawiera ukrytych informacji; żadna komenda nie omija walidacji engine.

## M2 — Minimalne zasoby i permanenty

**Status:** następny pakiet po zamknięciu M1.

- [ ] jawny model tap/untap;
- [ ] mana pool i reset zasobów w odpowiednim kroku;
- [ ] land drop z limitem na turę;
- [ ] rozróżnienie permanent/spell bez nazw kart w core;
- [ ] podstawowy koszt i płatność zasobu;
- [ ] testy legalnego i nielegalnego zagrania.

## M3 — Combat bez kart konkretnych

- [ ] deklaracja atakujących;
- [ ] deklaracja blokujących;
- [ ] obrażenia stworzeń i oznaczone obrażenia;
- [ ] state-based actions dla stworzeń;
- [ ] celowanie w gracza i permanent;
- [ ] scenariusz pełnej tury combat w symulatorze.

## M4 — Dane kart i tekstowy format talii

**Warunek wejścia:** właściciel dostarczy pierwszą listę kart i dane kolekcji.

- [ ] definicje pierwszych kart z polami `Set` i `Plan`;
- [ ] parser/writer wspólnego tekstowego formatu talii;
- [ ] registry `supported` dla pierwszych kart;
- [ ] testy limitu kopii, landów podstawowych i rozmiaru formatu;
- [ ] kreator talii UI bez `localStorage`, dopiero po stabilizacji parsera.

## M5 — Pierwsza pionowa ścieżka UI

- [ ] UI renderujące PlayerView;
- [ ] wysyłanie Command do engine;
- [ ] prezentacja Event i błędów;
- [ ] gra człowiek–RandomBot na syntetycznych kartach;
- [ ] eksport/import replayu.

## Decyzje blokujące dalszy zakres

- lista pierwszych realnych kart i ich dane `Set`/`Plan`;
- docelowy rozmiar pierwszego formatu talii;
- ewentualne dodatkowe reguły ponad minimalny sandbox.
